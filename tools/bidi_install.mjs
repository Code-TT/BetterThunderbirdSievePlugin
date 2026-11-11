#!/usr/bin/env node
/* Installiert sieve-filter-view.xpi via Remote Agent (WebDriver BiDi) webExtension.install.
 * Voraussetzung: Betterbird läuft mit --remote-debugging-port 9222. */
const DEBUG_PORT = 9222;
const XPI =
  "/Volumes/External Disk/Users/thomas/Documents/Development/005_ThunderbirdSieve/dist/sieve-filter-view-0.1.0.xpi";

const ws = new WebSocket(`ws://127.0.0.1:${DEBUG_PORT}/session`);
let id = 0;
const pending = new Map();

function send(method, params) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
    setTimeout(() => {
      if (pending.has(mid)) {
        pending.delete(mid);
        reject(new Error(`timeout: ${method}`));
      }
    }, 20000);
  });
}

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
    else p.resolve(msg.result);
  } else {
    console.log("event:", JSON.stringify(msg).slice(0, 200));
  }
};

ws.onerror = (e) => {
  console.error("ws error", e.message || e);
  process.exit(2);
};

ws.onopen = async () => {
  try {
    const session = await send("session.new", { capabilities: {} });
    console.log("session:", JSON.stringify(session).slice(0, 200));
    const sid = session.sessionId;
    let lastErr;
    for (const attempt of [
      { sessionId: sid },
      {},
      { sessionId: sid, extensionData: { type: "archivePath", path: XPI }, "moz:permanent": true },
      { extensionData: { type: "archivePath", path: XPI }, "moz:permanent": true },
    ]) {
      try {
        const params = { extensionData: { type: "archivePath", path: XPI }, "moz:permanent": true, ...attempt };
        const res = await send("webExtension.install", params);
        console.log("webExtension.install ->", JSON.stringify(res));
        process.exit(0);
      } catch (e) {
        lastErr = e;
        console.log("attempt", JSON.stringify(attempt), "->", e.message);
      }
    }
    throw lastErr;
  } catch (e) {
    console.error("FAILED:", e.message);
    try { console.error("detail:", e.stack); } catch {}
    process.exit(1);
  }
};
