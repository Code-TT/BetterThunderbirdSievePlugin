package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Fingerprint über Skripttext + Aktiv-Status — identisch zur Phase-2-Testbridge:
// sha256(f"{active}\x00{text}") mit active = "True"/"False" (Python bool → str).
func Fingerprint(text string, active bool) string {
	activeStr := "False"
	if active {
		activeStr = "True"
	}
	sum := sha256.Sum256([]byte(activeStr + "\x00" + text))
	return hex.EncodeToString(sum[:])
}

// LoadCreds liest Zugangsdaten aus der Desktop-Datei `.trella-mail` —
// exakt das Phase-2-Format mit Off-by-one-Fix 8a18b0f: 0-basiert
// Index 3 = Login, Index 4 = Passwort (Zeile 2 ist leer). Wird nie geloggt.
func LoadCreds() (login string, password string, err error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", "", err
	}
	data, err := os.ReadFile(filepath.Join(home, "Desktop", ".trella-mail"))
	if err != nil {
		return "", "", fmt.Errorf("credentials: %w", err)
	}
	lines := strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n")
	if len(lines) < 5 {
		return "", "", fmt.Errorf("credentials: Datei hat nur %d Zeilen (5 erwartet)", len(lines))
	}
	login = strings.TrimSpace(lines[3])
	password = strings.TrimSpace(lines[4])
	if login == "" || password == "" {
		return "", "", fmt.Errorf("credentials: Login oder Passwort leer (Index 3/4)")
	}
	return login, password, nil
}
