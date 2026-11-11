#!/usr/bin/env node
/* Minimaler Static-Server für addon/ui (Playwright braucht http:// wegen ES-Modulen). */
import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "addon");
const port = Number(process.argv[2] || 9430);
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" };

http
  .createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\.\./g, "");
    let file = path.join(root, rel);
    if (existsSync(file) && file.startsWith(root)) {
      res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
      createReadStream(file).pipe(res);
    } else {
      res.writeHead(404).end("not found");
    }
  })
  .listen(port, "127.0.0.1", () => console.log(`ui-server on http://127.0.0.1:${port}`));
