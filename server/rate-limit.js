"use strict";

// Limitador em memória por janela fixa. Suficiente para uma instância única;
// para várias instâncias use um store compartilhado (Redis) ou o WAF do provedor.
function createRateLimiter({ windowMs, max, maxKeys = 10000 }) {
  const hits = new Map();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.reset <= now) hits.delete(key);
  }, Math.max(windowMs, 1000));
  sweep.unref();

  function check(key) {
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      if (!entry && hits.size >= maxKeys) {
        // Proteção contra exaustão de memória: descarta a entrada mais antiga.
        hits.delete(hits.keys().next().value);
      }
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    return {
      allowed: entry.count <= max,
      remaining: Math.max(0, max - entry.count),
      retryAfter: Math.ceil((entry.reset - now) / 1000)
    };
  }

  return { check, stop: () => clearInterval(sweep) };
}

module.exports = { createRateLimiter };
