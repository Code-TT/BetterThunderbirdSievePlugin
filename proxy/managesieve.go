package main

// Minimaler ManageSieve-Client (RFC 5804) über TLS.
// implementiert genau die Operationen, die die Phase-2-Testbridge
// (tools/sieve_bridge.py) gegen mail.trellix.de:4190 belegt hat:
// LISTSCRIPTS / GETSCRIPT / PUTSCRIPT / DELETESCRIPT / SETACTIVE.
// Konflikt-Erkennung macht die HTTP-Schicht über Fingerprints (fingerprint.go).

import (
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"time"
)

// SieveClient kapselt eine ManageSieve-Verbindung (nicht threadsafe).
type SieveClient struct {
	conn net.Conn
	br   *bufioReader
	caps []string
}

// bufioReader ist ein kleiner Puffer-Reader (kein Extradep).
type bufioReader struct {
	rd  io.Reader
	buf []byte
}

func newBufioReader(rd io.Reader) *bufioReader { return &bufioReader{rd: rd, buf: make([]byte, 0, 4096)} }

// readLine liest bis \n und entfernt \r\n.
func (b *bufioReader) readLine() (string, error) {
	line := make([]byte, 0, 128)
	one := make([]byte, 1)
	for {
		n, err := b.rd.Read(one)
		if n == 1 {
			if one[0] == '\n' {
				s := string(line)
				s = strings.TrimSuffix(s, "\r")
				return s, nil
			}
			line = append(line, one[0])
			continue
		}
		if err != nil {
			return "", err
		}
	}
}

// readExact liest genau n Bytes.
func (b *bufioReader) readExact(n int) ([]byte, error) {
	out := make([]byte, n)
	_, err := io.ReadFull(b.rd, out)
	return out, err
}

// Connect baut die ManageSieve-Verbindung auf: Plaintext-Greeting → STARTTLS →
// TLS-Handshake (mail.trellix.de bietet kein implizites TLS auf 4190, nur
// STARTTLS — siehe Capability-Antwort). Zertifikatsprüfung ist ausgeschaltet,
// weil der interne Mailserver ein selbstsigniertes Zertifikat nutzt; gleiche
// Vertrauensbasis wie die Phase-2-Testbridge (im Intranet, Auth per SASL PLAIN
// über die TLS-Schicht).
func Connect(host string, port int, timeout time.Duration) (*SieveClient, error) {
	raw, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", host, port), timeout)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	c := &SieveClient{conn: raw, br: newBufioReader(raw)}
	_ = raw.SetDeadline(time.Now().Add(timeout))
	// Begrüßung im Klartext lesen: Capability-Zeilen bis zur ersten OK-Zeile.
	for {
		line, err := c.br.readLine()
		if err != nil {
			c.Close()
			return nil, fmt.Errorf("greeting: %w", err)
		}
		verb, _ := parseResponse(line)
		if verb == "OK" {
			break
		}
		if verb == "BYE" {
			c.Close()
			return nil, fmt.Errorf("server greeting: %s", line)
		}
		c.caps = append(c.caps, line)
	}
	// STARTTLS, wenn angeboten.
	if hasStartTLS(c.caps) {
		if err := c.send("STARTTLS"); err != nil {
			c.Close()
			return nil, err
		}
		resp, err := c.br.readLine()
		if err != nil {
			c.Close()
			return nil, err
		}
		verb, rest := parseResponse(resp)
		if verb != "OK" {
			c.Close()
			return nil, fmt.Errorf("STARTTLS abgelehnt: %s", strings.TrimSpace(rest))
		}
		tlsConn := tls.Client(raw, &tls.Config{ServerName: host, InsecureSkipVerify: true, MinVersion: tls.VersionTLS12})
		if err := tlsConn.Handshake(); err != nil {
			c.Close()
			return nil, fmt.Errorf("tls handshake: %w", err)
		}
		c.conn = tlsConn
		c.br = newBufioReader(tlsConn)
		c.caps = append(c.caps, "STARTTLS(negotiated)")
	}
	// Deadline nur für Connect/Handshake; danach wieder unbegrenzt.
	_ = c.conn.SetDeadline(time.Time{})
	return c, nil
}

func hasStartTLS(caps []string) bool {
	for _, l := range caps {
		if strings.Contains(l, "STARTTLS") {
			return true
		}
	}
	return false
}

// Login authentifiziert per SASL PLAIN. Dovecot sendet nach AUTHENTICATE
// zusätzliche Capability-Zeilen (RFC 5804 erlaubt das) — wir lesen bis OK/NO.
func (c *SieveClient) Login(authzID, authcID, password string) error {
	raw := authzID + "\x00" + authcID + "\x00" + password
	b64 := base64.StdEncoding.EncodeToString([]byte(raw))
	if err := c.send(fmt.Sprintf("AUTHENTICATE \"PLAIN\" \"%s\"", b64)); err != nil {
		return err
	}
	for {
		line, err := c.br.readLine()
		if err != nil {
			return err
		}
		verb, rest := parseResponse(line)
		if verb == "OK" {
			break
		}
		if verb == "NO" || verb == "BYE" {
			return fmt.Errorf("login: %s", strings.TrimSpace(rest))
		}
		// Capability-Zeile nach AUTHENTICATE — ignorieren.
	}
	// Dovecot sendet nach AUTHENTICATE ein Capability-Refrain und MEHRERE
	// OK-Zeilen (beobachtet: OK "TLS negotiation successful." + OK "Logged in.").
	// Alles gepufferte mit einer kurzen Read-Deadline drainieren — danach ist
	// der Strom synchron und die nächste Antwort gehört eindeutig zum nächsten
	// Kommando. Wir senden NOOP, damit mindestens eine Antwort kommt.
	if err := c.send("NOOP"); err != nil {
		return err
	}
	_ = c.conn.SetReadDeadline(time.Now().Add(1200 * time.Millisecond))
	sawOK := false
	for {
		line, err := c.br.readLine()
		if err != nil {
			// Deadline abgelaufen = nichts mehr gepuffert.
			break
		}
		verb, _ := parseResponse(line)
		if verb == "OK" {
			sawOK = true
		}
		if verb == "BYE" {
			_ = c.conn.SetReadDeadline(time.Time{})
			return fmt.Errorf("login: %s", strings.TrimSpace(line))
		}
	}
	_ = c.conn.SetReadDeadline(time.Time{})
	if !sawOK {
		return fmt.Errorf("login: keine Bestätigung nach AUTHENTICATE")
	}
	return nil
}

// Capability liefert die Capability-Zeilen (nach Login meist SIEVE-Version).
func (c *SieveClient) Capability() ([]string, error) {
	if err := c.send("CAPABILITY"); err != nil {
		return nil, err
	}
	var caps []string
	for {
		line, err := c.br.readLine()
		if err != nil {
			return nil, err
		}
		verb, _ := parseResponse(line)
		if verb == "OK" || verb == "NO" || verb == "BYE" {
			return caps, nil
		}
		caps = append(caps, line)
	}
}

// ScriptEntry ist ein Ergebnis von ListScripts.
type ScriptEntry struct {
	Name   string
	Active bool
}

// ListScripts: LISTSCRIPTS → Liste {name, active}.
func (c *SieveClient) ListScripts() ([]ScriptEntry, error) {
	if err := c.send("LISTSCRIPTS"); err != nil {
		return nil, err
	}
	var out []ScriptEntry
	for {
		line, err := c.br.readLine()
		if err != nil {
			return nil, err
		}
		debugLine("ls", line)
		verb, rest := parseResponse(line)
		if verb == "OK" {
			return out, nil
		}
		if verb == "NO" || verb == "BYE" {
			return nil, fmt.Errorf("LISTSCRIPTS: %s", strings.TrimSpace(rest))
		}
		name, active := parseListScriptLine(line)
		out = append(out, ScriptEntry{Name: name, Active: active})
	}
}

// GetScript holt den Text eines Skripts und den Aktiv-Status.
func (c *SieveClient) GetScript(name string) (string, bool, error) {
	if err := c.send(fmt.Sprintf("GETSCRIPT %s", quote(name))); err != nil {
		return "", false, err
	}
	line, err := c.br.readLine()
	if err != nil {
		return "", false, err
	}
	verb, rest := parseResponse(line)
	if verb == "NO" || verb == "BYE" {
		return "", false, fmt.Errorf("GETSCRIPT: %s", strings.TrimSpace(rest))
	}
	// Antwort: {size+}\r\n<literal>… dann OK-Zeile
	size, err := parseLiteralSize(line)
	if err != nil {
		return "", false, fmt.Errorf("GETSCRIPT: unerwartete Antwort: %q", line)
	}
	data, err := c.br.readExact(size)
	if err != nil {
		return "", false, err
	}
	text := string(data)
	// literal gefolgt von CRLF — dann OK-Zeile lesen.
	if _, err := c.br.readLine(); err != nil {
		return "", false, err
	}
	okLine, err := c.br.readLine()
	if err != nil {
		return "", false, err
	}
	verb2, rest2 := parseResponse(okLine)
	if verb2 != "OK" {
		return "", false, fmt.Errorf("GETSCRIPT: %s", strings.TrimSpace(rest2))
	}
	// Aktiv-Status separat ermitteln.
	scripts, err := c.ListScripts()
	if err != nil {
		return text, false, err
	}
	active := false
	for _, s := range scripts {
		if s.Name == name && s.Active {
			active = true
		}
	}
	return text, active, nil
}

// PutScript lädt ein Skript hoch (PUTSCRIPT mit Literal).
func (c *SieveClient) PutScript(name, text string) error {
	if err := c.send(fmt.Sprintf("PUTSCRIPT %s {%d+}", quote(name), len(text))); err != nil {
		return err
	}
	if _, err := c.conn.Write([]byte(text)); err != nil {
		return err
	}
	if _, err := c.conn.Write([]byte("\r\n")); err != nil {
		return err
	}
	return c.expectOK("PUTSCRIPT")
}

// DeleteScript entfernt ein Skript.
func (c *SieveClient) DeleteScript(name string) error {
	if err := c.send(fmt.Sprintf("DELETESCRIPT %s", quote(name))); err != nil {
		return err
	}
	return c.expectOK("DELETESCRIPT")
}

// SetActive aktiviert ein Skript (leerer Name deaktiviert alles).
func (c *SieveClient) SetActive(name string) error {
	if err := c.send(fmt.Sprintf("SETACTIVE %s", quote(name))); err != nil {
		return err
	}
	return c.expectOK("SETACTIVE")
}

// Close beendet die Sitzung sauber.
func (c *SieveClient) Close() {
	if c == nil || c.conn == nil {
		return
	}
	_, _ = c.conn.Write([]byte("LOGOUT\r\n"))
	_ = c.conn.Close()
}

// --- Interne Helfer ---

func (c *SieveClient) send(line string) error {
	_, err := c.conn.Write([]byte(line + "\r\n"))
	return err
}

func (c *SieveClient) expectOK(op string) error {
	line, err := c.br.readLine()
	if err != nil {
		return err
	}
	verb, rest := parseResponse(line)
	if verb == "OK" {
		return nil
	}
	return fmt.Errorf("%s: %s", op, strings.TrimSpace(rest))
}

// parseResponse trennt Verb (OK/NO/BYE/Zeile) vom Rest.
func parseResponse(line string) (verb, rest string) {
	t := strings.TrimSpace(line)
	if strings.HasPrefix(t, "OK") {
		return "OK", strings.TrimPrefix(t, "OK")
	}
	if strings.HasPrefix(t, "NO") {
		return "NO", strings.TrimPrefix(t, "NO")
	}
	if strings.HasPrefix(t, "BYE") {
		return "BYE", strings.TrimPrefix(t, "BYE")
	}
	return "", t
}

// quote schreibt einen SQ-String (RFC 5804 §2.4): "…" mit \\ und \" escaped.
func quote(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		if r == '\\' || r == '"' {
			b.WriteByte('\\')
		}
		b.WriteRune(r)
	}
	b.WriteByte('"')
	return b.String()
}

// parseListScriptLine zerlegt '"name" ACTIVE'.
func parseListScriptLine(line string) (string, bool) {
	rest := strings.TrimSpace(line)
	if !strings.HasPrefix(rest, "\"") {
		return rest, false
	}
	end := -1
	for i := 1; i < len(rest); i++ {
		if rest[i] == '\\' {
			i++
			continue
		}
		if rest[i] == '"' {
			end = i
			break
		}
	}
	if end < 0 {
		return rest, false
	}
	name := unquote(rest[1:end])
	active := strings.Contains(strings.ToUpper(rest[end+1:]), "ACTIVE")
	return name, active
}

// unquote löst \\ und \" in einem gequoteten Namen auf.
func unquote(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' && i+1 < len(s) {
			i++
		}
		b.WriteByte(s[i])
	}
	return b.String()
}

// parseLiteralSize liest "{N+}".
func parseLiteralSize(line string) (int, error) {
	t := strings.TrimSpace(line)
	if !strings.HasPrefix(t, "{") {
		return 0, fmt.Errorf("kein Literal: %q", line)
	}
	end := strings.Index(t, "}")
	if end < 0 {
		return 0, fmt.Errorf("kein Literal: %q", line)
	}
	sizeStr := strings.TrimSuffix(t[1:end], "+")
	return strconv.Atoi(sizeStr)
}
