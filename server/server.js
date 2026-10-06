"use strict";

const http = require("node:http");
const { URLSearchParams } = require("node:url");

const { loadConfig } = require("./config");
const { securityHeaders, applyHeaders } = require("./security");
const { createRateLimiter } = require("./rate-limit");
const { createStaticHandler } = require("./static");
const { validateLead, whatsappLink, createLeadStore } = require("./leads");

const MAX_BODY_BYTES = 8 * 1024;
const MAX_URL_LENGTH = 2048;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit) {
      reject(new HttpError(413, "Payload muito grande."));
      req.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, "Payload muito grande."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", Buffer.byteLength(payload));
  res.end(payload);
}

function clientIp(req, config) {
  if (config.trustProxy) {
    const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (xff) return xff;
  }
  return req.socket.remoteAddress || "unknown";
}

function expectedOrigins(req, config) {
  if (config.allowedOrigins.length) return config.allowedOrigins;
  const host = req.headers.host;
  if (!host) return [];
  let proto = req.socket.encrypted ? "https" : "http";
  if (config.trustProxy && req.headers["x-forwarded-proto"]) {
    proto = String(req.headers["x-forwarded-proto"]).split(",")[0].trim();
  }
  return [`${proto}://${host}`];
}

// Proteção CSRF: navegadores sempre enviam Origin/Sec-Fetch-Site em POST.
function isAllowedOrigin(req, config) {
  const origin = req.headers.origin;
  if (origin) return expectedOrigins(req, config).includes(origin.replace(/\/+$/, ""));
  const site = req.headers["sec-fetch-site"];
  if (site) return site === "same-origin" || site === "none";
  return true; // cliente sem navegador (ex.: monitoramento) — ainda sujeito ao rate limit
}

function createApp(overrides = {}) {
  const config = { ...loadConfig(), ...overrides };
  const logger = overrides.logger || console;
  const headers = securityHeaders(config);
  const serveStatic = createStaticHandler(config.publicDir);
  const limiter = createRateLimiter(config.rateLimit);
  const store = overrides.store || createLeadStore({
    dataDir: config.dataDir,
    webhookUrl: config.leadWebhookUrl,
    webhookToken: config.leadWebhookToken,
    logger
  });
  const defaultWhatsapp = `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(
    "Olá, Dra. Letícia! Vim pelo site e gostaria de agendar uma avaliação."
  )}`;

  async function handleLead(req, res) {
    const contentType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    const isJson = contentType === "application/json";
    const isForm = contentType === "application/x-www-form-urlencoded";

    if (!isAllowedOrigin(req, config)) throw new HttpError(403, "Origem não autorizada.");
    if (!isJson && !isForm) throw new HttpError(415, "Formato não suportado.");

    const rl = limiter.check(clientIp(req, config));
    res.setHeader("RateLimit-Remaining", String(rl.remaining));
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfter));
      throw new HttpError(429, "Muitas tentativas. Tente novamente em alguns minutos ou fale pelo WhatsApp.");
    }

    const raw = await readBody(req, MAX_BODY_BYTES);
    let input;
    if (isJson) {
      try {
        input = JSON.parse(raw);
      } catch {
        throw new HttpError(400, "JSON inválido.");
      }
    } else {
      input = Object.fromEntries(new URLSearchParams(raw));
    }

    const result = validateLead(input, { minFillMs: config.minFillMs });

    if (result.spam) {
      // Resposta idêntica à de sucesso para não ensinar o robô a contornar o filtro.
      logger.info("[leads] envio descartado pelo filtro anti-spam");
      if (isForm) {
        res.statusCode = 303;
        res.setHeader("Location", defaultWhatsapp);
        return res.end();
      }
      return sendJson(res, 200, { ok: true, whatsapp: defaultWhatsapp });
    }

    if (!result.ok) {
      if (isForm) {
        res.statusCode = 303;
        res.setHeader("Location", "/#contato");
        return res.end();
      }
      return sendJson(res, 422, { ok: false, errors: result.errors });
    }

    await store.save(result.lead);
    const link = whatsappLink(config.whatsapp, result.lead);
    if (isForm) {
      res.statusCode = 303;
      res.setHeader("Location", link);
      return res.end();
    }
    return sendJson(res, 201, { ok: true, whatsapp: link });
  }

  async function handler(req, res) {
    applyHeaders(res, headers);

    if ((req.url || "").length > MAX_URL_LENGTH) throw new HttpError(414, "URL muito longa.");

    let pathname;
    try {
      pathname = new URL(req.url, "http://localhost").pathname;
    } catch {
      throw new HttpError(400, "Requisição inválida.");
    }

    if (pathname === "/api/leads") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        throw new HttpError(405, "Método não permitido.");
      }
      return handleLead(req, res);
    }

    if (pathname.startsWith("/api/")) throw new HttpError(404, "Não encontrado.");

    if (pathname === "/healthz") {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.end("ok");
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      throw new HttpError(405, "Método não permitido.");
    }

    return serveStatic(req, res, pathname);
  }

  const server = http.createServer((req, res) => {
    handler(req, res).catch((err) => {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) logger.error("[server] erro inesperado:", err && err.stack ? err.stack : err);
      if (res.headersSent) return res.destroy();
      sendJson(res, status, { ok: false, error: status === 500 ? "Erro interno." : err.message });
    });
  });

  // Mitiga ataques de conexão lenta (slowloris).
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 50;
  server.on("close", () => limiter.stop());

  return { server, config, store };
}

if (require.main === module) {
  const { server, config } = createApp();
  server.listen(config.port, config.host, () => {
    console.log(`Divina Pele rodando em http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

module.exports = { createApp };
