"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

const { createApp } = require("../server/server");
const { validateLead } = require("../server/leads");

const silent = { info() {}, warn() {}, error() {} };
let server;
let base;
let dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "divinapele-"));
  const app = createApp({ dataDir, logger: silent, minFillMs: 0, rateLimit: { windowMs: 60000, max: 3 } });
  server = app.server;
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const validLead = () => ({
  nome: "Maria Silva",
  telefone: "(48) 99999-1234",
  interesse: "labial",
  periodo: "tarde",
  consentimento: true,
  website: "",
  ts: Date.now() - 10000
});

function rawRequest(raw) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(server.address().port, "127.0.0.1", () => socket.write(raw));
    let data = "";
    socket.on("data", (c) => (data += c));
    socket.on("end", () => resolve(data));
    socket.on("error", reject);
  });
}

test("serve a página inicial com cabeçalhos de segurança", async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.match(res.headers.get("content-security-policy"), /script-src 'self'/);
  assert.match(res.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("x-powered-by"), null);
  const html = await res.text();
  assert.match(html, /Dra\. Letícia Sebem/);
});

test("comprime respostas de texto e responde 304 com ETag", async () => {
  const res = await fetch(`${base}/css/styles.css`, { headers: { "accept-encoding": "br" } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-encoding"), "br");
  const etag = res.headers.get("etag");
  const again = await fetch(`${base}/css/styles.css`, { headers: { "if-none-match": etag } });
  assert.equal(again.status, 304);
});

test("retorna 404 personalizado para rotas inexistentes", async () => {
  const res = await fetch(`${base}/nao-existe`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /não foi encontrada/);
});

test("bloqueia path traversal e arquivos ocultos", async () => {
  for (const p of ["/../package.json", "/%2e%2e/package.json", "/..%2fserver/server.js", "/%2e%2e%2f%2e%2e%2fetc/passwd", "/.env"]) {
    const raw = await rawRequest(`GET ${p} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
    assert.match(raw, /^HTTP\/1\.1 (404|400)/, `deveria bloquear ${p}`);
    assert.doesNotMatch(raw, /"name": "divinapele/);
    assert.doesNotMatch(raw, /root:x:0/);
  }
});

test("rejeita métodos não permitidos", async () => {
  const res = await fetch(`${base}/`, { method: "DELETE" });
  assert.equal(res.status, 405);
  const api = await fetch(`${base}/api/leads`);
  assert.equal(api.status, 405);
});

test("registra lead válido e devolve link do WhatsApp", async () => {
  const res = await fetch(`${base}/api/leads`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify(validLead())
  });
  assert.equal(res.status, 201);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.match(json.whatsapp, /^https:\/\/wa\.me\/5548988097020\?text=/);
  assert.match(decodeURIComponent(json.whatsapp), /Maria Silva/);

  const lines = fs.readFileSync(path.join(dataDir, "leads.ndjson"), "utf8").trim().split("\n");
  const saved = JSON.parse(lines.at(-1));
  assert.equal(saved.telefone, "48999991234");
  assert.equal(saved.interesse, "labial");
  assert.equal(saved.consentimento.aceito, true);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(path.join(dataDir, "leads.ndjson")).mode & 0o777, 0o600);
  }
});

test("bloqueia envio de outra origem (CSRF)", async () => {
  const res = await fetch(`${base}/api/leads`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://site-malicioso.example" },
    body: JSON.stringify(validLead())
  });
  assert.equal(res.status, 403);
});

test("rejeita content-type inesperado e payload grande", async () => {
  const wrongType = await fetch(`${base}/api/leads`, {
    method: "POST",
    headers: { "content-type": "text/plain", origin: base },
    body: "oi"
  });
  assert.equal(wrongType.status, 415);

  const big = await fetch(`${base}/api/leads`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ ...validLead(), nome: "a".repeat(20000) })
  });
  assert.equal(big.status, 413);
});

test("aplica rate limit por IP", async () => {
  let last;
  for (let i = 0; i < 6; i++) {
    last = await fetch(`${base}/api/leads`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ ...validLead(), nome: "" })
    });
  }
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get("retry-after")) > 0);
});

test("validação: dados inválidos, honeypot e tempo mínimo", () => {
  const invalid = validateLead({ nome: "1", telefone: "123", consentimento: false });
  assert.equal(invalid.ok, false);
  assert.deepEqual(Object.keys(invalid.errors).sort(), ["consentimento", "nome", "telefone"]);

  assert.equal(validateLead({ ...validLead(), website: "http://spam" }).spam, true);
  assert.equal(validateLead({ ...validLead(), ts: Date.now() }, { minFillMs: 3000 }).spam, true);
  assert.equal(validateLead([]).ok, false);
});

test("validação: normaliza e neutraliza fórmulas e caracteres de controle", () => {
  const r = validateLead({ ...validLead(), nome: "=HYPERLINK(\"x\")\u0000 Ana", telefone: "+55 48 99999-1234", interesse: "__proto__" }, { minFillMs: 0 });
  assert.equal(r.ok, true);
  assert.ok(r.lead.nome.startsWith("'="));
  assert.doesNotMatch(r.lead.nome, /\u0000/);
  assert.equal(r.lead.telefone, "48999991234");
  assert.equal(r.lead.interesse, "avaliacao");
});
