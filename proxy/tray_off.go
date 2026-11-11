//go:build !systray

package main

// Headless-Fallback: kein Systray in Server-/CI-Builds.
func runTray(_ int, onExit func()) {
	if onExit != nil {
		onExit()
	}
}
