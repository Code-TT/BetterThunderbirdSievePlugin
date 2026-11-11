#!/usr/bin/env node
/* Build-Pipeline: zippt addon/ → dist/sieve-filter-view-<version>.xpi
 * (XPI = ZIP mit manifest.json im Root; ohne build/ oder .git). */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const addonDir = path.join(root, "addon");
const distDir = path.join(root, "dist");
mkdirSync(distDir, { recursive: true });

const manifest = JSON.parse(readFileSync(path.join(addonDir, "manifest.json"), "utf8"));
const outFile = path.join(distDir, `sieve-filter-view-${manifest.version}.xpi`);

function listAddonFiles() {
  const tracked = execFileSync("git", ["ls-files", "addon/"], { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
  if (tracked.length) return tracked;
  // Fallback (uncommitted PoC-Dateien): Rekursiv über addon/ walken.
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (!e.name.endsWith(".xpi")) out.push(path.relative(root, p));
    }
  };
  walk(addonDir);
  return out;
}

const files = listAddonFiles();

if (!files.length) throw new Error("keine addon/-Dateien via git ls-files gefunden");

// `zip`-CLI mit relativen Pfaden aus addon/ aufrufen → manifest.json im XPI-Root.
const rel = files.map((f) => f.replace(/^addon\//, ""));
execFileSync(
  "zip",
  ["-q", "-X", outFile.replace(/^\/$/, ""), ...rel],
  { cwd: addonDir, stdio: "inherit" }
);
console.log(`built ${outFile} (${files.length} files)`);
