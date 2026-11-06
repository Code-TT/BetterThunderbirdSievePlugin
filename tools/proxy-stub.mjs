#!/usr/bin/env node
/* Proxy-Stub (PoC): GET /api/sieve/scripts → { rules, scripts }
 * Quelle: addon/data/sieve-dump.json (kein ManageSieve-Traffic, read-only).
 * Ersetzt später den Go-Proxy (Phase 3). Usage: node tools/proxy-stub.mjs [port] */
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dump = JSON.parse(
  readFileSync(path.join(root, "addon/data/sieve-dump.json"), "utf8")
);
const port = Number(process.argv[2] || 9420);

http
  .createServer((req, res) => {
    if (req.method === "GET" && req.url.split("?")[0] === "/api/sieve/scripts") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(dump));
      return;
    }
    res.writeHead(404).end();
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`proxy stub on http://127.0.0.1:${port}/api/sieve/scripts`)
  );
