package main

import (
	"flag"
	"fmt"
	"net/http"
	_ "net/http/pprof"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	port := flag.Int("port", 9421, "HTTP-Port auf 127.0.0.1")
	tray := flag.Bool("tray", false, "Systray-Icon anzeigen (benötigt Build mit -tags systray)")
	flag.Parse()

	args := flag.Args()
	if len(args) > 0 {
		switch args[0] {
		case "install-autostart":
			if err := ApplyAutostart(true); err != nil {
				fmt.Fprintln(os.Stderr, "install-autostart fehlgeschlagen:", err)
				os.Exit(1)
			}
			logf("Autostart aktiviert")
			return
		case "remove-autostart":
			if err := ApplyAutostart(false); err != nil {
				fmt.Fprintln(os.Stderr, "remove-autostart fehlgeschlagen:", err)
				os.Exit(1)
			}
			logf("Autostart deaktiviert")
			return
		default:
			fmt.Fprintf(os.Stderr, "unbekanntes Kommando: %s (install-autostart|remove-autostart)\n", args[0])
			os.Exit(2)
		}
	}

	store := NewConfigStore()
	cfg, err := store.Load(*port)
	if err != nil {
		logf("Warnung: Konfiguration nicht lesbar (%v) — nutze Defaults", err)
		cfg = DefaultConfig(*port)
	}
	// HTTP-Port aus Config kann vom CLI-Flag abweichen — CLI-Flag gewinnt.
	cfg.HTTPPort = *port

	srv := NewServer(store, *port)
	addr := fmt.Sprintf("127.0.0.1:%d", *port)
	httpSrv := &http.Server{Addr: addr, Handler: srv.Handler()}
	go func() {
		logf("Sieve Proxy lauscht auf http://%s (→ %s:%d)", addr, cfg.PrimaryAccount().Host, cfg.PrimaryAccount().Port)
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Fprintln(os.Stderr, "HTTP-Server:", err)
			os.Exit(1)
		}
	}()

	if *tray {
		runTray(*port, func() { httpSrv.Close(); os.Exit(0) })
		// systray.Run blockiert; nach Quit kommt onExit.
		return
	}

	// Headless: auf Ctrl+C/SIGTERM warten.
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig
	logf("Beende Proxy")
	_ = httpSrv.Close()
}
