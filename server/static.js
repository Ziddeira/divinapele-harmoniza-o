"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

const COMPRESSIBLE = new Set([".html", ".css", ".js", ".json", ".webmanifest", ".svg", ".txt", ".xml"]);

function cacheControl(ext) {
  if (ext === ".html") return "no-cache";
  if (ext === ".woff2") return "public, max-age=31536000, immutable";
  if ([".webp", ".avif", ".jpg", ".jpeg", ".png", ".svg", ".ico"].includes(ext)) return "public, max-age=2592000";
  return "public, max-age=86400";
}

function createStaticHandler(rootDir) {
  const root = fs.realpathSync(rootDir);
  const compressedCache = new Map();

  // Resolve o caminho garantindo que permaneça dentro de `root` (anti path traversal).
  async function resolveFile(urlPath) {
    let decoded;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      return null;
    }
    if (decoded.includes("\0")) return null;
    // Bloqueia arquivos ocultos (.env, .git, etc.).
    if (decoded.split("/").some((seg) => seg.startsWith("."))) return null;

    const candidates = [];
    const rel = path.normalize(decoded).replace(/^([/\\])+/, "");
    if (decoded.endsWith("/")) candidates.push(path.join(rel, "index.html"));
    else {
      candidates.push(rel);
      if (!path.extname(rel)) candidates.push(rel + ".html", path.join(rel, "index.html"));
    }

    for (const candidate of candidates) {
      const full = path.resolve(root, candidate);
      if (full !== root && !full.startsWith(root + path.sep)) return null;
      try {
        const real = await fs.promises.realpath(full);
        if (!real.startsWith(root + path.sep)) return null; // symlink para fora da raiz
        const stat = await fs.promises.stat(real);
        if (stat.isFile()) return { file: real, stat };
      } catch {
        /* tenta o próximo candidato */
      }
    }
    return null;
  }

  async function compressed(file, stat, encoding) {
    const key = `${file}:${encoding}`;
    const hit = compressedCache.get(key);
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.body;
    const raw = await fs.promises.readFile(file);
    const body =
      encoding === "br"
        ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } })
        : zlib.gzipSync(raw, { level: 9 });
    compressedCache.set(key, { body, mtimeMs: stat.mtimeMs, size: stat.size });
    return body;
  }

  async function send(req, res, found, status = 200) {
    const { file, stat } = found;
    const ext = path.extname(file).toLowerCase();
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;

    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", status === 200 ? cacheControl(ext) : "no-store");
    res.setHeader("Vary", "Accept-Encoding");
    if (status === 200) {
      res.setHeader("ETag", etag);
      if (req.headers["if-none-match"] === etag) {
        res.statusCode = 304;
        return res.end();
      }
    }

    const accept = String(req.headers["accept-encoding"] || "");
    let encoding = null;
    if (COMPRESSIBLE.has(ext) && stat.size > 512) {
      if (/\bbr\b/.test(accept)) encoding = "br";
      else if (/\bgzip\b/.test(accept)) encoding = "gzip";
    }

    res.statusCode = status;
    if (encoding) {
      const body = await compressed(file, stat, encoding);
      res.setHeader("Content-Encoding", encoding);
      res.setHeader("Content-Length", body.length);
      return res.end(req.method === "HEAD" ? undefined : body);
    }
    res.setHeader("Content-Length", stat.size);
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).on("error", () => res.destroy()).pipe(res);
  }

  return async function serveStatic(req, res, pathname) {
    const found = await resolveFile(pathname);
    if (found) return send(req, res, found);
    const notFound = await resolveFile("/404.html");
    if (notFound) return send(req, res, notFound, 404);
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Página não encontrada");
  };
}

module.exports = { createStaticHandler };
