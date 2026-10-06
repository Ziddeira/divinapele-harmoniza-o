"use strict";

// Content-Security-Policy restritiva: nenhum script/estilo inline ou de terceiros.
// O único conteúdo externo é o mapa do Google, carregado apenas após clique.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src https://www.google.com https://maps.google.com",
  // O envio sem JavaScript redireciona (303) para o WhatsApp; form-action vale para o redirect.
  "form-action 'self' https://wa.me https://api.whatsapp.com",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "manifest-src 'self'"
];

function securityHeaders(config) {
  const csp = config.hsts ? CSP.concat("upgrade-insecure-requests") : CSP;
  const headers = {
    "Content-Security-Policy": csp.join("; "),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-DNS-Prefetch-Control": "off",
    "X-Permitted-Cross-Domain-Policies": "none"
  };
  if (config.hsts) headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  return headers;
}

function applyHeaders(res, headers) {
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
}

module.exports = { securityHeaders, applyHeaders, CSP };
