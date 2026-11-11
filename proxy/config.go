package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

// AccountConfig beschreibt ein vom Add-on gesetztes Sieve-Konto.
// Das Passwort kommt bewusst NICHT hierher (AGENTS.md: Passwort nur über
// die Desktop-Datei ODER den TB-Login-Manager) — der Proxy nimmt es aus
// `.trella-mail` (Phase-2-Muster, 8a18b0f). Ein Add-on-Überschreiben des
// Passworts wird ignoriert; nur Host/Port/Login werden gespeichert.
type AccountConfig struct {
	Host   string `json:"host"`
	Port   int    `json:"port"`
	Login  string `json:"login"`
	UseTLS bool   `json:"use_tls"`
}

// ProxyConfig ist der Zustand des Config-Endpunkts (/config, /status).
type ProxyConfig struct {
	Accounts    []AccountConfig `json:"accounts"`
	HTTPPort    int             `json:"http_port"`
	Autostart   bool            `json:"autostart"`
	HTTPDefault int             `json:"-"`
}

// DefaultConfig liefert die Ausgangskonfiguration mit dem Phase-2-Konto.
func DefaultConfig(httpPort int) *ProxyConfig {
	return &ProxyConfig{
		Accounts: []AccountConfig{{
			Host:   "mail.trellix.de",
			Port:   4190,
			Login:  "thomas@trella.de",
			UseTLS: true,
		}},
		HTTPPort:    httpPort,
		Autostart:   false,
		HTTPDefault: httpPort,
	}
}

// ConfigStore speichert die Konfiguration in einer Datei unter dem User-Config-Dir.
type ConfigStore struct {
	mu   sync.Mutex
	path string
}

func configPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir, _ = os.UserHomeDir()
	}
	sub := "BetterThunderbirdSieve"
	if runtime.GOOS == "darwin" {
		sub = filepath.Join("BetterThunderbirdSieve")
	} else {
		sub = filepath.Join("betterthunderbirdsieve")
	}
	return filepath.Join(dir, sub, "config.json")
}

func NewConfigStore() *ConfigStore { return &ConfigStore{path: configPath()} }

// Load liest die Konfiguration; ohne Datei → Default.
func (s *ConfigStore) Load(defaultPort int) (*ProxyConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return DefaultConfig(defaultPort), nil
		}
		return nil, err
	}
	cfg := DefaultConfig(defaultPort)
	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("config parse: %w", err)
	}
	return cfg, nil
}

// SavePersist schreibt nur Host/Port/Login/autostart (keine Geheimnisse).
func (s *ConfigStore) SavePersist(cfg *ProxyConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// PrimaryAccount liefert das erste Konto (Phase 3 kennt genau eines).
func (cfg *ProxyConfig) PrimaryAccount() AccountConfig {
	if len(cfg.Accounts) == 0 {
		return AccountConfig{Host: "mail.trellix.de", Port: 4190, Login: "thomas@trella.de", UseTLS: true}
	}
	return cfg.Accounts[0]
}

// Sanitize entfernt Passwort-ähnliche Felder aus Client-Payloads.
func Sanitize(s string) string { return strings.ReplaceAll(s, "\x00", "") }
