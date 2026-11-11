package main

import (
	"fmt"
	"os"
	"runtime"
)

var logEnabled = os.Getenv("SIEVEPROXY_QUIET") == ""

func logf(format string, args ...any) {
	if logEnabled {
		fmt.Printf("sieveproxy: "+format+"\n", args...)
	}
}

func runtimeGOOS() string { return runtime.GOOS }

var debugEnabled = os.Getenv("SIEVEPROXY_DEBUG") != ""

func debugLine(tag, line string) {
	if debugEnabled {
		fmt.Printf("sieveproxy: debug %s: %q\n", tag, line)
	}
}
