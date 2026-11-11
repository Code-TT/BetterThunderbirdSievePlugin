package main

import "encoding/base64"

// trayIconPNG dekodiert das eingebettete Icon zur Laufzeit.
var trayIconPNG = func() []byte {
	d, _ := base64.StdEncoding.DecodeString(trayIconBase64)
	return d
}()
