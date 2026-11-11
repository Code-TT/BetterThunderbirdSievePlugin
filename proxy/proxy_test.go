package main

import (
	"os"
	"path/filepath"
	"testing"
)

// Fingerprint muss Byte-identisch zur Python-Testbridge sein:
// sha256(f"{active}\x00{text}") mit Python-bool → "True"/"False".
func TestFingerprintMatchesPythonBridge(t *testing.T) {
	got := Fingerprint("a,b\nworld", true)
	want := "3c3216d211f379ff226c23081f839b9234379870d0c454c3cb6486a975834b63"
	if got != want {
		t.Fatalf("Fingerprint weicht ab: got %s want %s", got, want)
	}
	// Inaktives Skript muss anderen Fingerprint liefern.
	if Fingerprint("a,b\nworld", false) == got {
		t.Fatal("aktiver/inaktiver Fingerprint identisch — falsch")
	}
}

func TestQuoteAndParseListScript(t *testing.T) {
	if got := quote(`he said "hi" \ bye`); got != `"he said \"hi\" \\ bye"` {
		t.Fatalf("quote falsch: %s", got)
	}
	name, active := parseListScriptLine(`"sogo" ACTIVE`)
	if name != "sogo" || !active {
		t.Fatalf("parseListScriptLine: %q %v", name, active)
	}
	name, active = parseListScriptLine(`"test"`)
	if name != "test" || active {
		t.Fatalf("parseListScriptLine inaktiv: %q %v", name, active)
	}
}

func TestParseLiteralSize(t *testing.T) {
	n, err := parseLiteralSize("{1941+}")
	if err != nil || n != 1941 {
		t.Fatalf("parseLiteralSize: %d %v", n, err)
	}
	if _, err := parseLiteralSize("OK"); err == nil {
		t.Fatal("kein Fehler bei Nicht-Literal")
	}
}

func TestLoadCredsIndices(t *testing.T) {
	dir := t.TempDir()
	home := os.Getenv("HOME")
	if err := os.Setenv("HOME", dir); err != nil {
		t.Skip("HOME nicht umsetzbar")
	}
	defer func() { _ = os.Setenv("HOME", home) }()
	if err := os.MkdirAll(filepath.Join(dir, "Desktop"), 0o755); err != nil {
		t.Fatal(err)
	}
	// Zeile 2 leer (Index 1), Login/Passwort auf Zeile 4/5 (Index 3/4) — 8a18b0f.
	content := "irgendwas\n\nnochwas\nuser@example.test\ngeheim\nrest\n"
	if err := os.WriteFile(filepath.Join(dir, "Desktop", ".trella-mail"), []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	login, pw, err := LoadCreds()
	if err != nil {
		t.Fatalf("LoadCreds: %v", err)
	}
	if login != "user@example.test" || pw != "geheim" {
		t.Fatalf("Indizes falsch: login=%q pw=%q", login, pw)
	}
}

func TestConfigStoreRoundtrip(t *testing.T) {
	dir := t.TempDir()
	old, err := os.UserConfigDir()
	if err != nil {
		t.Skip("kein UserConfigDir")
	}
	if err := os.Setenv("XDG_CONFIG_HOME", dir); err != nil && old == "" {
		t.Skip("env nicht umsetzbar")
	}
	defer func() { _ = os.Unsetenv("XDG_CONFIG_HOME") }()
	store := NewConfigStore()
	cfg, err := store.Load(9421)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.PrimaryAccount().Host != "mail.trellix.de" || cfg.PrimaryAccount().Port != 4190 {
		t.Fatalf("Default-Konto falsch: %+v", cfg.PrimaryAccount())
	}
	cfg.Autostart = true
	if err := store.SavePersist(cfg); err != nil {
		t.Fatalf("Save: %v", err)
	}
	cfg2, err := store.Load(9421)
	if err != nil {
		t.Fatalf("Reload: %v", err)
	}
	if !cfg2.Autostart || cfg2.HTTPPort != 9421 {
		t.Fatalf("Roundtrip falsch: %+v", cfg2)
	}
}
