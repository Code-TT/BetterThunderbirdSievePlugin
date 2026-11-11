package main

import (
	"os/exec"
	"strings"
)

func runCmd(name string, args ...string) (string, error) {
	out, err := exec.Command(name, args...).CombinedOutput()
	return string(out), err
}

func runCmdQuiet(name string, args ...string) error {
	_, err := exec.Command(name, args...).CombinedOutput()
	return err
}

func escapeXML(s string) string {
	r := strings.ReplaceAll(s, "&", "&amp;")
	r = strings.ReplaceAll(r, "<", "&lt;")
	r = strings.ReplaceAll(r, ">", "&gt;")
	r = strings.ReplaceAll(r, "\"", "&quot;")
	return r
}
