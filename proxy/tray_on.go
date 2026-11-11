//go:build systray

// Systray-Integration (getlantern/systray). Aktiv mit `-tags systray`.
// Ohne den Tag bleibt der Proxy headless (Server-/CI-Builds).
package main

import (
	"fmt"

	"github.com/getlantern/systray"
)

func runTray(httpPort int, onExit func()) {
	systray.Run(func() {
		systray.SetIcon(trayIconData())
		systray.SetTitle("Sieve Proxy")
		systray.SetTooltip(fmt.Sprintf("Sieve Proxy — http://127.0.0.1:%d", httpPort))
		mStatus := systray.AddMenuItem(fmt.Sprintf("Läuft auf Port %d", httpPort), "Status")
		mStatus.Disable()
		mQuit := systray.AddMenuItem("Beenden", "Proxy beenden")
		go func() {
			<-mQuit.ClickedCh
			systray.Quit()
		}()
	}, onExit)
}

// trayIconData liefert ein 16x16-PNG-Icon (schwarzes Sieb-Symbol-Platzhalter-Quadrat).
// Liegt als eingebettetes Asset in tray_icon.go.
func trayIconData() []byte { return trayIconPNG }
