/* Sieve-Parser/Serializer (RFC 5228 Teilmenge, erweitert um elsif/else/not/multiline).
 * Verlustfrei: Jeder AST-Knoten behält seinen rohen Quelltext (`raw`), der Serializer
 * gibt unveränderte Knoten byte-identisch zurück. Geänderte Knoten werden kanonisch
 * neu serialisiert.
 *
 * Parser-Basis: Struktur und Token-Klassen angelehnt an Sieve Reloaded (thsmi/sieve),
 * libs/libSieve/toolkit/SieveLexer.mjs + SieveParser.mjs (XPI sieve.remsrc@mozdev.org,
 * Version 0.6.x, installiert im Betterbird-Profil). Eigenständige, reduzierte
 * Implementierung — keine Codeübernahme, nur Design-Referenz:
 *   https://github.com/thsmi/sieve (MIT-artige Lizenz, siehe Quelldateikopf).
 * Warum nicht die Original-Lib 1:1? libSieve ist an das Addon-Binding gebunden
 * (SieveScriptDOM, Gui-Widgets) und anonymisiert Originaltexte beim Serialisieren —
 * für Byte-identischen Roundtrip brauchen wir verlustfreie Raw-Slices.
 */
"use strict";

/* ---------------------------------------------------------------- Lexer --- */

const WS = /[ \t\r\n]/;

/** Token: {type, raw, start, end, value?} — raw ist IMMER der exakte Quelltext-Slice. */
function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  const push = (type, start, end, extra) =>
    tokens.push({ type, raw: src.slice(start, end), start, end, ...extra });
  while (i < n) {
    const start = i;
    const ch = src[i];
    if (WS.test(ch)) {
      while (i < n && WS.test(src[i])) i++;
      push("ws", start, i);
      continue;
    }
    if (ch === "#") {
      while (i < n && src[i] !== "\n") i++;
      if (i < n) i++; // \n gehört zum Hash-Kommentar
      push("comment", start, i);
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end === -1) throw new SieveSyntaxError(`Ungeschlossener /*-Kommentar ab Offset ${start}`);
      i = end + 2;
      push("comment", start, i);
      continue;
    }
    if (ch === '"') {
      let val = "";
      i++;
      while (i < n && src[i] !== '"') {
        if (src[i] === "\\") {
          if (i + 1 >= n) throw new SieveSyntaxError(`Dangling Escape ab Offset ${start}`);
          const esc = src[i + 1];
          val += esc === "n" ? "\n" : esc === "t" ? "\t" : esc;
          i += 2;
        } else {
          if (src[i] === "\n") throw new SieveSyntaxError(`Zeilenumbruch in quoted string ab Offset ${start}`);
          val += src[i];
          i++;
        }
      }
      if (i >= n) throw new SieveSyntaxError(`Ungeschlossener String ab Offset ${start}`);
      i++; // schließendes "
      push("string", start, i, { value: val });
      continue;
    }
    const punct = { "[": "lbracket", "]": "rbracket", "(": "lparen", ")": "rparen", ",": "comma", ";": "semicolon", "{": "lbrace", "}": "rbrace" };
    if (punct[ch]) { push(punct[ch], start, i + 1); i++; continue; }
    // text: ... . (multiline string, RFC 5228 §2.7.1)
    if (src.startsWith("text:", i) && /[\s]/.test(src[i + 5] || " ")) {
      const lineEnd = src.indexOf("\n", i);
      if (lineEnd === -1) throw new SieveSyntaxError(`Ungeschlossenes text: ab Offset ${i}`);
      let j = lineEnd + 1;
      let end = -1;
      while (j < n) {
        if (src[j] === "." && (src[j + 1] === "\n" || j + 1 === n)) { end = j + 1; break; }
        const nl = src.indexOf("\n", j);
        if (nl === -1) break;
        j = nl + 1;
      }
      if (end === -1) throw new SieveSyntaxError(`Ungeschlossener text:-Block ab Offset ${i}`);
      i = end;
      const rawText = src.slice(start, i);
      // value: alles zwischen "text:<ws>\n" und ".\n", CRLF unescape → \n
      const m = rawText.match(/^text:[ \t]*\r?\n([\s\S]*)\.\r?\n?$/);
      const val = m ? m[1].replace(/\\n/g, "\n") : "";
      push("multiline", start, i, { value: val });
      continue;
    }
    // Bezeichner, Tags, Zahlen
    if (/[A-Za-z0-9_:]/.test(ch)) {
      while (i < n && /[A-Za-z0-9_:.]/.test(src[i])) i++;
      const raw = src.slice(start, i);
      push(raw.startsWith(":") ? "tag" : "identifier", start, i, { value: raw.toLowerCase() });
      continue;
    }
    throw new SieveSyntaxError(`Unerwartetes Zeichen '${ch}' an Offset ${i}`);
  }
  return tokens;
}

class SieveSyntaxError extends Error {
  constructor(msg) { super(msg); this.name = "SieveSyntaxError"; }
}

/* --------------------------------------------------------------- Parser --- */

/** Hilfs-Stream über Token mit Skip von Whitespace/Kommentaren. */
class TokenStream {
  constructor(tokens, src) {
    this.tokens = tokens;
    this.src = src;
    this.i = 0;
  }
  peek() {
    let j = this.i;
    while (j < this.tokens.length && (this.tokens[j].type === "ws" || this.tokens[j].type === "comment")) j++;
    return j < this.tokens.length ? this.tokens[j] : null;
  }
  _nextContentIndex() {
    let j = this.i;
    while (j < this.tokens.length && (this.tokens[j].type === "ws" || this.tokens[j].type === "comment")) j++;
    return j;
  }
  next() {
    const t = this.peek();
    if (!t) throw new SieveSyntaxError("Unerwartetes Ende des Skripts");
    this.i = this._nextContentIndex() + 1;
    return t;
  }
  isType(type) { const t = this.peek(); return !!t && t.type === type; }
  expect(type, what) {
    const t = this.next();
    if (t.type !== type) throw new SieveSyntaxError(`Erwartet ${what || type}, gefunden '${t.raw}'`);
    return t;
  }
  /** Roh-Slice von Offset a bis b (inklusive End-Offset des letzten Tokens). */
  slice(startTok, endTok) { return this.src.slice(startTok.start, endTok.end); }
}

/** Letztes verbrauchte Sach-Token (für Slice-Ende). */
function lastConsumed(ts) { return ts.tokens[ts.i - 1]; }

/** Inhalt (Argumente) eines Tests/Kommandos. */
function parseArgs(ts) {
  const parts = []; // {type:'tag'|'string'|'number'|'stringlist', raw, ...}
  while (true) {
    const t = ts.peek();
    if (!t) break;
    if (t.type === "tag") { ts.next(); parts.push({ type: "tag", raw: t.raw, value: t.value }); }
    else if (t.type === "string") { ts.next(); parts.push({ type: "string", raw: t.raw, value: t.value }); }
    else if (t.type === "multiline") { ts.next(); parts.push({ type: "string", raw: t.raw, value: t.value, multiline: true }); }
    else if (t.type === "identifier" && /^[0-9]/.test(t.raw)) { ts.next(); parts.push({ type: "number", raw: t.raw, value: t.value }); }
    else if (t.type === "lbracket") {
      const open = ts.next();
      const strings = [];
      while (ts.isType("string") || ts.isType("multiline")) {
        const s = ts.next();
        strings.push({ raw: s.raw, value: s.value, multiline: s.type === "multiline" });
        if (ts.isType("comma")) { const c = ts.next(); strings.push({ sep: c.raw }); }
        else break;
      }
      const close = ts.expect("rbracket", "']' (Stringlisten-Ende)");
      parts.push({ type: "stringlist", raw: ts.slice(open, close), strings });
    }
    else break;
  }
  return parts;
}

/** Test-Ausdruck: allof/anyof (parenthesized), not <test>, sonst Test mit Args. */
function parseTest(ts) {
  const startTok = ts.next();
  if (startTok.type !== "identifier") throw new SieveSyntaxError(`Erwartet Testname, gefunden '${startTok.raw}'`);
  const name = startTok.raw;
  let node;
  if (name === "allof" || name === "anyof") {
    ts.expect("lparen", "'(' nach " + name);
    const tests = [parseTest(ts)];
    while (ts.isType("comma")) { ts.next(); tests.push(parseTest(ts)); }
    ts.expect("rparen", "')' nach Testliste");
    node = { kind: "combine", op: name, tests };
  } else if (name === "not") {
    const inner = parseTest(ts);
    node = { kind: "not", test: inner };
  } else {
    const args = parseArgs(ts);
    node = { kind: "test", name, args };
  }
  node.raw = ts.slice(startTok, lastConsumed(ts));
  return node;
}

function parseBlock(ts) {
  const open = ts.expect("lbrace", "'{' (Blockbeginn)");
  const commands = [];
  while (!ts.isType("rbrace")) {
    if (!ts.peek()) throw new SieveSyntaxError("Unerwartetes Skriptende — fehlende '}'");
    commands.push(parseCommandWithPre(ts));
  }
  const close = ts.next();
  const tail = ts.src.slice(lastConsumed(ts).end, close.start);
  return { commands, raw: ts.slice(open, close), tail };
}

/** Wie parseCommand, merkt sich zusätzlich Whitespace/Kommentare davor (`.pre`). */
function parseCommandWithPre(ts) {
  const nxt = ts.peek();
  const idxContent = ts._nextContentIndex();
  let prevContent = null;
  for (let k = idxContent - 1; k >= 0; k--) {
    if (ts.tokens[k].type !== "ws" && ts.tokens[k].type !== "comment") { prevContent = ts.tokens[k]; break; }
  }
  const cmd = parseCommand(ts);
  cmd.pre = ts.src.slice(prevContent ? prevContent.end : 0, nxt.start);
  return cmd;
}

function parseCommand(ts) {
  const startTok = ts.next();
  if (startTok.type !== "identifier") throw new SieveSyntaxError(`Erwartet Kommando, gefunden '${startTok.raw}'`);
  const name = startTok.raw;
  const lname = name.toLowerCase();
  let cmd;
  if (lname === "require") {
    const args = parseArgs(ts);
    ts.expect("semicolon", "';' nach require");
    cmd = { kind: "require", args };
  } else if (lname === "if" || lname === "elsif") {
    const test = parseTest(ts);
    const block = parseBlock(ts);
    cmd = { kind: "if", elif: lname === "elsif", test, block };
  } else if (lname === "else") {
    const block = parseBlock(ts);
    cmd = { kind: "else", block };
  } else {
    // Aktion: fileinto/redirect/stop/keep/discard/vacation/addheader/...
    const args = parseArgs(ts);
    ts.expect("semicolon", `';' nach ${name}`);
    cmd = { kind: "action", name, args };
  }
  cmd.raw = ts.slice(startTok, lastConsumed(ts));
  return cmd;
}

export function parseSieve(src) {
  const tokens = tokenize(src);
  const ts = new TokenStream(tokens, src);
  const commands = [];
  while (ts.peek()) commands.push(parseCommandWithPre(ts));
  return { commands, raw: src, tail: ts.src.slice(lastConsumed(ts).end) };
}

/* ----------------------------------------------------------- Serializer --- */

/** Serializer: unveränderte Knoten byte-identisch (Raw-Slices + `pre`-Separator);
 *  als `__dirty` markierte Knoten werden kanonisch neu serialisiert. */
export function serializeSieve(ast) {
  if (ast.__dirty !== true && !subtreeDirty(ast) && ast.raw !== undefined) return ast.raw;
  const body = ast.commands.map(serializeCommand).join("") + (ast.tail ?? "");
  return body;
}

function serializeCommand(cmd) {
  if (subtreeDirty(cmd)) {
    switch (cmd.kind) {
      case "require":
        return (cmd.pre ?? "") + `require ${cmd.args.map(serializeArg).join(" ")};\n`;
      case "if":
        return (cmd.pre ?? "") + `${cmd.elif ? "elsif" : "if"} ${serializeTest(cmd.test)} {\n${cmd.block.commands.map(serializeCommand).join("")}}\n`;
      case "else":
        return (cmd.pre ?? "") + `else {\n${cmd.block.commands.map(serializeCommand).join("")}}\n`;
      case "action":
        return (cmd.pre ?? "") + `${cmd.name} ${cmd.args.map(serializeArg).join(" ")};\n`;
      default:
        throw new SieveSyntaxError(`Kann Knoten '${cmd.kind}' nicht serialisieren`);
    }
  }
  return (cmd.pre ?? "") + cmd.raw;
}

function serializeTest(test) {
  if (subtreeDirty(test)) {
    if (test.kind === "combine") return `${test.op} (${test.tests.map(serializeTest).join(", ")})`;
    if (test.kind === "not") return `not ${serializeTest(test.test)}`;
    return `${test.name} ${test.args.map(serializeArg).join(" ")}`;
  }
  return test.raw;
}

/** Ein Knoten wird kanonisch serialisiert, wenn er selbst oder ein Nachfahre dirty ist. */
function subtreeDirty(node) {
  if (node.__dirty === true) return true;
  for (const child of [node.test, node.block, ...(node.tests ?? []), ...(node.args ?? []), ...(node.commands ?? [])]) {
    if (child && subtreeDirty(child)) return true;
  }
  return false;
}

function serializeArg(arg) {
  if (arg.__dirty !== true) return arg.raw;
  switch (arg.type) {
    case "tag": return arg.value;
    case "string":
      if (arg.multiline) return `text:\n${String(arg.value).replace(/\n/g, "\\n")}\n.\n`;
      return quoteString(arg.value);
    case "number": return String(arg.value);
    case "stringlist":
      return `[${arg.strings.filter(s => !s.sep).map(s => quoteString(s.value)).join(", ")}]`;
    default:
      throw new SieveSyntaxError(`Kann Argument vom Typ '${arg.type}' nicht serialisieren`);
  }
}

function quoteString(v) {
  return '"' + String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t") + '"';
}

/* ------------------------------------------------------ Edit-Helfer ------- */

/** Alle if/elsif-Regeln als flache Liste mit Bedingung(en) + Aktion(en). */
export function extractRules(ast) {
  const rules = [];
  for (const cmd of ast.commands) {
    if (cmd.kind === "if") {
      rules.push({
        conditions: testConditions(cmd.test),
        combinator: cmd.test.kind === "combine" ? cmd.test.op : null,
        actions: actionsOf(cmd.block),
        cmd,
      });
    }
  }
  return rules;
}

function testConditions(test) {
  const out = [];
  const walk = (t) => {
    if (t.kind === "combine") { t.tests.forEach(walk); return; }
    if (t.kind === "not") { out.push({ negated: true, ...testConditions(t.test)[0] }); return; }
    const parts = { test: t.name, headers: [], match: null, values: [] };
    for (const a of t.args || []) {
      if (a.type === "tag") parts.match = a.value.replace(/^:/, "");
      else if (a.type === "string") (parts.headers.length === 0 ? parts.headers : parts.values).push(a.value);
      else if (a.type === "stringlist") {
        const list = a.strings.filter(s => !s.sep).map(s => s.value);
        (parts.headers.length === 0 ? parts.headers : parts.values).push(...list);
      }
    }
    out.push(parts);
  };
  walk(test);
  return out;
}

function actionsOf(block) {
  return block.commands
    .filter((c) => c.kind === "action")
    .map((c) => ({ name: c.name, args: (c.args || []).map((a) => a.value ?? a.raw) }));
}

/** require-Liste aus dem Skript. */
export function requires(ast) {
  for (const c of ast.commands) {
    if (c.kind === "require") {
      return (c.args || [])
        .filter((a) => a.type === "stringlist" || a.type === "string")
        .flatMap((a) => (a.type === "stringlist" ? a.strings.filter(s => !s.sep).map(s => s.value) : [a.value]));
    }
  }
  return [];
}

/** Neue fileinto-Regel (kanonisch) an das AST anhängen. */
export function appendFileIntoRule(ast, { test = "address", match = ":contains", header = "from", value, folder }) {
  const src =
    `if ${test} ${match} "${header}" "${value}" {\n` +
    `    fileinto "${folder}";\n` +
    `}\n`;
  const parsed = parseSieve(src);
  const needsRequire = !requires(ast).includes("fileinto");
  if (needsRequire) {
    // require-Zeile nach den bestehenden requires einfügen bzw. erzeugen
    const firstNonRequire = ast.commands.findIndex((c) => c.kind !== "require");
    const req = { kind: "require", args: [{ type: "stringlist", raw: '["fileinto"]', strings: [{ raw: '"fileinto"', value: "fileinto" }] }], raw: 'require ["fileinto"];\n' };
    if (firstNonRequire === -1) ast.commands.push(req);
    else ast.commands.splice(firstNonRequire, 0, req);
  }
  ast.commands.push(parsed.commands[0]);
  markDirty(ast);
  return ast;
}

function markDirty(ast) {
  for (const c of ast.commands) c.__dirty = true;
  ast.__dirty = true;
  ast.raw = undefined;
}

export { SieveSyntaxError };
