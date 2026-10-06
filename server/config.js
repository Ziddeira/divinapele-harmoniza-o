"use strict";

const path = require("node:path");

function list(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  return {
    production,
    host: env.HOST || "0.0.0.0",
    port: int(env.PORT, 3000),
    publicDir: path.resolve(env.PUBLIC_DIR || path.join(__dirname, "..", "public")),
    dataDir: path.resolve(env.DATA_DIR || path.join(__dirname, "..", "data")),
    // Origens autorizadas a enviar o formulário (ex.: https://www.divinapele.com.br).
    // Se vazio, aceita apenas a mesma origem do Host da requisição.
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    // Só confie em X-Forwarded-For quando houver proxy reverso (Nginx, Cloudflare, Render...).
    trustProxy: env.TRUST_PROXY === "1" || env.TRUST_PROXY === "true",
    // HSTS só faz sentido servido via HTTPS (produção atrás de TLS).
    hsts: env.HSTS ? env.HSTS === "1" || env.HSTS === "true" : production,
    whatsapp: (env.WHATSAPP_NUMBER || "5548988097020").replace(/\D/g, ""),
    // Webhook opcional para encaminhar leads (n8n, Make, Zapier, CRM...).
    leadWebhookUrl: env.LEAD_WEBHOOK_URL || "",
    leadWebhookToken: env.LEAD_WEBHOOK_TOKEN || "",
    rateLimit: {
      windowMs: int(env.RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000),
      max: int(env.RATE_LIMIT_MAX, 5)
    },
    minFillMs: int(env.MIN_FILL_MS, 2500)
  };
}

module.exports = { loadConfig };
