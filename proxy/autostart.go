package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// ApplyAutostart aktiviert/deaktiviert den Autostart des Proxies:
// macOS → LaunchAgent (~/Library/LaunchAgents), Windows → HKCU Run,
// Linux → ~/.config/autostart/*.desktop. Idempotent (überschreibt sich selbst).
func ApplyAutostart(enable bool) error {
	switch runtime.GOOS {
	case "darwin":
		return applyLaunchAgent(enable)
	case "windows":
		return applyWindowsRun(enable)
	case "linux":
		return applyLinuxDesktop(enable)
	default:
		return fmt.Errorf("autostart: Plattform %s nicht unterstützt", runtime.GOOS)
	}
}

func selfPath() (string, error) {
	if p, err := os.Executable(); err == nil {
		return p, nil
	}
	return os.Args[0], nil
}

// --- macOS LaunchAgent ---

func launchAgentPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "LaunchAgents", "de.trellix.sieveproxy.plist")
}

func applyLaunchAgent(enable bool) error {
	p := launchAgentPath()
	if !enable {
		_, err := os.Stat(p)
		if os.IsNotExist(err) {
			return nil // schon aus
		}
		runLaunchctl("unload", p)
		return os.Remove(p)
	}
	self, err := selfPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	port := currentHTTPPort()
	plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>de.trellix.sieveproxy</string>
  <key>ProgramArguments</key>
  <array>
    <string>%s</string>
    <string>-port</string>
    <string>%d</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
`, escapeXML(self), port)
	if err := os.WriteFile(p, []byte(plist), 0o644); err != nil {
		return err
	}
	return runLaunchctl("load", p)
}

func runLaunchctl(args ...string) error {
	out, err := runCmd("launchctl", args...)
	if err != nil {
		return fmt.Errorf("launchctl %s: %w (%s)", strings.Join(args, " "), err, strings.TrimSpace(out))
	}
	return nil
}

// --- Windows HKCU Run ---

func applyWindowsRun(enable bool) error {
	const key = `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
	const valName = "SieveProxy"
	if !enable {
		return runCmdQuiet("reg", "delete", key, "/v", valName, "/f")
	}
	self, err := selfPath()
	if err != nil {
		return err
	}
	port := currentHTTPPort()
	return runCmdQuiet("reg", "add", key, "/v", valName, "/t", "REG_SZ", "/d",
		fmt.Sprintf(`"%s" -port %d`, self, port), "/f")
}

// --- Linux .desktop ---

func linuxDesktopPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "autostart", "sieveproxy.desktop")
}

func applyLinuxDesktop(enable bool) error {
	p := linuxDesktopPath()
	if !enable {
		return os.Remove(p)
	}
	self, err := selfPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	port := currentHTTPPort()
	desktop := fmt.Sprintf(`[Desktop Entry]
Type=Application
Name=Sieve Proxy
Exec="%s" -port %d
X-GNOME-Autostart-enabled=true
`, self, port)
	return os.WriteFile(p, []byte(desktop), 0o644)
}

// currentHTTPPort liest die konfigurierte HTTP-Port-Einstellung (Default 9421).
func currentHTTPPort() int {
	store := NewConfigStore()
	cfg, err := store.Load(9421)
	if err != nil {
		return 9421
	}
	if cfg.HTTPPort <= 0 {
		return 9421
	}
	return cfg.HTTPPort
}
