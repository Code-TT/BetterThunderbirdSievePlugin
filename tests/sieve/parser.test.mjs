/* Parser-Roundtrip-Tests: parse → serialize == input (byte-identisch),
 * plus Struktur-Checks und Edit-Serialisierung. Läuft mit `node --test`.
 * Referenz-Skript: backup/sieve-sogo-2026-11-06.txt (echter Serverstand „sogo").
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSieve, serializeSieve, extractRules, requires, appendFileIntoRule, SieveSyntaxError,
} from "../../addon/lib/sieve/parser.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOGO = readFileSync(path.join(ROOT, "backup", "sieve-sogo-2026-11-06.txt"), "utf8");

test("Roundtrip: echtes sogo-Skript byte-identisch", () => {
  const ast = parseSieve(SOGO);
  assert.equal(serializeSieve(ast), SOGO);
});

test("sogo: Struktur — 1 require + 21 if-Regeln mit fileinto", () => {
  const ast = parseSieve(SOGO);
  assert.deepEqual(requires(ast), ["fileinto"]);
  const rules = extractRules(ast);
  assert.equal(rules.length, 21);
  assert.equal(rules[0].actions[0].name, "fileinto");
  assert.equal(rules[0].actions[0].args[0], "AliExpress");
});

test("Roundtrip: Kommentarformen, elsif/else, not, Zahlen, text:-Block", () => {
  const script = [
    "# header comment",
    "/* block",
    "   comment */",
    'require ["fileinto", "vacation"];',
    "if not header :is [\"To\", \"Cc\"] \"a@b.de\" {",
    "    keep;",
    "} elsif address :matches \"from\" \"*@x.y\" {",
    "    vacation text:",
    "Ich bin bis Montag weg.\\n",
    ".",
    "    ;",
    "    stop;",
    "} else {",
    "    fileinto \"X\";",
    "}",
    "# trailing",
    "",
  ].join("\n");
  const ast = parseSieve(script);
  assert.equal(serializeSieve(ast), script);
});

test("Roundtrip: ungewöhnliche Whitespaces bleiben erhalten", () => {
  const script = 'require ["fileinto"];\r\nif allof(address :contains "from"  "a@b.com")  {\r\n\tfileinto  "A" ;\r\n}\r\n';
  const ast = parseSieve(script);
  assert.equal(serializeSieve(ast), script);
});

test("Syntaxfehler werden als SieveSyntaxError gemeldet", () => {
  assert.throws(() => parseSieve('if header :is "x" "y" {'), SieveSyntaxError);
  assert.throws(() => parseSieve('require ["fileinto"'), SieveSyntaxError);
  assert.throws(() => parseSieve('fileinto "a"\n'), SieveSyntaxError);
});

test("Edit: geänderte Regel → Rest byte-identisch, neue Regel kanonisch angehängt", () => {
  const ast = parseSieve(SOGO);
  const rules = extractRules(ast);
  // Regel 2 (facebook) action-Ordner ändern: Block-Node als dirty markieren
  rules[2].cmd.block.__dirty = true;
  rules[2].cmd.block.commands = [
    { kind: "action", name: "fileinto", args: [{ type: "string", raw: '"Social"', value: "Social", __dirty: true }], __dirty: true },
  ];
  const out = serializeSieve(ast);
  //_require-Zeile und die anderen Regeln unangetastet:
  assert.ok(out.startsWith('require ["fileinto"];\r\nif allof (address :contains "from" "aliexpress.com")'));
  assert.ok(out.includes('fileinto "Facebook"') === false);
  assert.ok(out.includes('fileinto "Social"'));
  // Ergebnis bleibt wieder parsebar und stabil:
  assert.equal(serializeSieve(parseSieve(out)), out);
});

test("appendFileIntoRule: neue Regel + require-Ergänzung", () => {
  const ast = parseSieve(SOGO);
  appendFileIntoRule(ast, { value: "z@example.com", folder: "Z-Test" });
  const out = serializeSieve(ast);
  assert.ok(out.includes('if address :contains "from" "z@example.com"'));
  assert.ok(out.includes('fileinto "Z-Test"'));
  assert.equal(serializeSieve(parseSieve(out)), out);
});
