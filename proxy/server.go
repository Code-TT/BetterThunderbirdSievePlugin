package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Server implementiert exakt die Phase-2-Bridge-API (tools/sieve_bridge.py)
// plus Config-Endpunkt. Nur 127.0.0.1. Es werden nie Query-Parameter oder
// Passwörter geloggt.
type Server struct {
	store     *ConfigStore
	httpPort  int
	allowSogo func() bool // Deaktivieren des aktiven "sogo" nur mit Freigabe
}

func NewServer(store *ConfigStore, httpPort int) *Server {
	return &Server{
		store:     store,
		httpPort:  httpPort,
		allowSogo: func() bool { return false }, // Read-only-Rückfallebene: nie ohne env
	}
}

func (s *Server) writeJSON(w http.ResponseWriter, code int, obj any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(obj)
}

func (s *Server) writeErr(w http.ResponseWriter, code int, msg string) {
	s.writeJSON(w, code, map[string]any{"error": msg})
}

// dial opens one ManageSieve connection per request (wie die Testbridge:
// connect → Operation → logout).
func (s *Server) dial() (*SieveClient, error) {
	cfg, err := s.store.Load(s.httpPort)
	if err != nil {
		return nil, fmt.Errorf("config: %w", err)
	}
	acc := cfg.PrimaryAccount()
	login, pw, err := LoadCreds()
	if err != nil {
		return nil, err
	}
	c, err := Connect(acc.Host, acc.Port, 15*time.Second)
	if err != nil {
		return nil, err
	}
	authz := acc.Login
	if authz == "" {
		authz = login
	}
	if err := c.Login(authz, login, pw); err != nil {
		c.Close()
		return nil, fmt.Errorf("ManageSieve-Login fehlgeschlagen: %w", err)
	}
	return c, nil
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/scripts", s.handleScripts)
	mux.HandleFunc("/script/", s.handleScript)
	mux.HandleFunc("/deactivate", s.handleDeactivate)
	mux.HandleFunc("/config", s.handleConfig)
	mux.HandleFunc("/status", s.handleStatus)
	return logPaths(mux)
}

// logPaths loggt nur Method+Pfad (ohne Query — Namen könnten darin stehen).
func logPaths(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		logf("%s %s", r.Method, r.URL.Path)
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleScripts(w http.ResponseWriter, r *http.Request) {
	c, err := s.dial()
	if err != nil {
		s.writeErr(w, 502, err.Error())
		return
	}
	defer c.Close()
	scripts, err := c.ListScripts()
	if err != nil {
		s.writeErr(w, 502, err.Error())
		return
	}
	cfg, _ := s.store.Load(s.httpPort)
	acc := cfg.PrimaryAccount()
	out := make([]map[string]any, 0, len(scripts))
	active := ""
	for _, sc := range scripts {
		text, act, err := c.GetScript(sc.Name)
		if err != nil {
			s.writeErr(w, 502, err.Error())
			return
		}
		out = append(out, map[string]any{
			"name": sc.Name, "active": act, "fingerprint": Fingerprint(text, act),
		})
		if act {
			active = sc.Name
		}
	}
	s.writeJSON(w, 200, map[string]any{
		"scripts": out, "active": active, "server": fmt.Sprintf("%s:%d", acc.Host, acc.Port),
	})
}

func (s *Server) handleScript(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/script/")
	if name == "" {
		s.writeErr(w, 400, "Skriptname fehlt")
		return
	}
	name, _ = url.PathUnescape(name)
	switch r.Method {
	case http.MethodGet:
		s.getScript(w, name)
	case http.MethodPut:
		s.putScript(w, name, r)
	case http.MethodDelete:
		s.deleteScript(w, name, r.URL.Query())
	case http.MethodPost:
		if strings.HasSuffix(r.URL.Path, "/activate") {
			s.activate(w, name)
			return
		}
		s.writeErr(w, 404, "not found")
	default:
		s.writeErr(w, 405, "method not allowed")
	}
}

func (s *Server) getScript(w http.ResponseWriter, name string) {
	c, err := s.dial()
	if err != nil {
		s.writeErr(w, 502, err.Error())
		return
	}
	defer c.Close()
	text, active, err := c.GetScript(name)
	if err != nil {
		if strings.Contains(err.Error(), "GETSCRIPT") {
			s.writeErr(w, 404, err.Error())
			return
		}
		s.writeErr(w, 502, err.Error())
		return
	}
	s.writeJSON(w, 200, map[string]any{
		"name": name, "active": active, "fingerprint": Fingerprint(text, active), "text": text,
	})
}

func (s *Server) putScript(w http.ResponseWriter, name string, r *http.Request) {
	var body struct {
		Text        string  `json:"text"`
		IfUnchanged *string `json:"if_unchanged"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		s.writeErr(w, 400, "ungültiger Body: "+err.Error())
		return
	}
	c, err := s.dial()
	if err != nil {
		s.writeErr(w, 502, err.Error())
		return
	}
	defer c.Close()
	if body.IfUnchanged != nil {
		text, active, err := c.GetScript(name)
		if err != nil {
			s.writeErr(w, 502, err.Error())
			return
		}
		if Fingerprint(text, active) != *body.IfUnchanged {
			s.writeJSON(w, 409, map[string]any{
				"error":             "conflict: Skript wurde seit dem Lesen geändert",
				"currentFingerprint": Fingerprint(text, active),
			})
			return
		}
	}
	if err := c.PutScript(name, body.Text); err != nil {
		s.writeErr(w, 400, "PUTSCRIPT abgelehnt: "+err.Error())
		return
	}
	text, active, err := c.GetScript(name)
	if err != nil {
		s.writeErr(w, 502, err.Error())
		return
	}
	s.writeJSON(w, 200, map[string]any{"fingerprint": Fingerprint(text, active)})
}

func (s *Server) deleteScript(w http.ResponseWriter, name string, qs url.Values) {
	if qs.Get("confirm") != "1" {
		s.writeErr(w, 400, "Doppel-Check fehlt: confirm=1 erforderlich")
		return
	}
	ifUnchanged := qs.Get("if_unchanged")
	c, err := s.dial()
	if err != nil {
		s.writeErr(w, 502, err.Error())
		return
	}
	defer c.Close()
	scripts, err := c.ListScripts()
	if err != nil {
		s.writeErr(w, 502, err.Error())
		return
	}
	active := false
	for _, sc := range scripts {
		if sc.Name == name {
			active = sc.Active
		}
	}
	if active {
		s.writeErr(w, 409, "Aktives Skript kann nicht gelöscht werden — erst deaktivieren")
		return
	}
	text, _, err := c.GetScript(name)
	if err != nil {
		s.writeErr(w, 404, err.Error())
		return
	}
	if ifUnchanged != "" && Fingerprint(text, false) != ifUnchanged {
		s.writeErr(w, 409, "conflict: Skript wurde seit dem Lesen geändert")
		return
	}
	if err := c.DeleteScript(name); err != nil {
		s.writeErr(w, 400, "DELETESCRIPT abgelehnt: "+err.Error())
		return
	}
	s.writeJSON(w, 200, map[string]any{"deleted": name})
}

func (s *Server) activate(w http.ResponseWriter, name string) {
	c, err := s.dial()
	if err != nil {
		s.writeErr(w, 502, err.Error())
		return
	}
	defer c.Close()
	if err := c.SetActive(name); err != nil {
		s.writeErr(w, 400, err.Error())
		return
	}
	s.writeJSON(w, 200, map[string]any{"activated": name, "ok": true})
}

func (s *Server) handleDeactivate(w http.ResponseWriter, r *http.Request) {
	c, err := s.dial()
	if err != nil {
		s.writeErr(w, 502, err.Error())
		return
	}
	defer c.Close()
	scripts, err := c.ListScripts()
	if err != nil {
		s.writeErr(w, 502, err.Error())
		return
	}
	active := ""
	for _, sc := range scripts {
		if sc.Active {
			active = sc.Name
		}
	}
	// Sicherheits-/Restore-Pfad wie Phase 2: sogo deaktivieren nur mit Freigabe.
	if active == "sogo" && !s.allowSogo() {
		s.writeErr(w, 403, "sogo ist aktiv — Deaktivieren nur mit BRIDGE_ALLOW_SOGO=1 (Restore-Pfad)")
		return
	}
	if err := c.SetActive(""); err != nil {
		s.writeErr(w, 400, err.Error())
		return
	}
	s.writeJSON(w, 200, map[string]any{"deactivated": true})
}

// handleConfig: GET → aktueller Stand; PUT/POST → Accounts/autostart setzen
// (ohne Passwort; siehe AccountConfig).
func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := s.store.Load(s.httpPort)
	if err != nil {
		s.writeErr(w, 500, err.Error())
		return
	}
	switch r.Method {
	case http.MethodGet:
		s.writeJSON(w, 200, cfg)
	case http.MethodPut, http.MethodPost:
		var in struct {
			Accounts  *[]AccountConfig `json:"accounts"`
			Autostart *bool            `json:"autostart"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			s.writeErr(w, 400, "ungültiger Body: "+err.Error())
			return
		}
		if in.Accounts != nil {
			cfg.Accounts = *in.Accounts
		}
		if in.Autostart != nil {
			cfg.Autostart = *in.Autostart
			if err := ApplyAutostart(*in.Autostart); err != nil {
				s.writeErr(w, 500, "autostart: "+err.Error())
				return
			}
		}
		if err := s.store.SavePersist(cfg); err != nil {
			s.writeErr(w, 500, err.Error())
			return
		}
		s.writeJSON(w, 200, cfg)
	default:
		s.writeErr(w, 405, "method not allowed")
	}
}

// handleStatus: lokaler Gesundheitszustand für das Add-on (ohne Serverzugriff).
func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	cfg, err := s.store.Load(s.httpPort)
	if err != nil {
		s.writeErr(w, 500, err.Error())
		return
	}
	acc := cfg.PrimaryAccount()
	_, _, credErr := LoadCreds()
	credOK := credErr == nil
	s.writeJSON(w, 200, map[string]any{
		"ok":              true,
		"http_port":       s.httpPort,
		"account_host":    acc.Host,
		"account_port":    acc.Port,
		"account_login":   acc.Login,
		"creds_available": credOK,
		"autostart":       cfg.Autostart,
		"platform":        runtimeGOOS(),
	})
}

// unused helper markers
var _ = net.IPv4len
var _ = strconv.Itoa
