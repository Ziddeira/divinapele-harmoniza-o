"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const INTERESSES = {
  avaliacao: "Ainda não sei / Avaliação",
  harmonizacao: "Harmonização facial",
  toxina: "Toxina botulínica",
  labial: "Preenchimento labial",
  bioestimulador: "Bioestimuladores de colágeno",
  rinomodelacao: "Rinomodelação",
  olheiras: "Tratamento de olheiras"
};

const PERIODOS = {
  qualquer: "Qualquer horário",
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Início da noite"
};

// Caracteres de controle, de largura zero e de direção bidirecional.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u2028-\\u202E\\u2060-\\u206F\\uFEFF]", "g");

// Remove caracteres de controle, normaliza Unicode e espaços.
function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

// Evita "CSV/Formula injection" caso os leads sejam abertos em planilhas.
function neutralizeFormula(value) {
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

function normalizePhone(value) {
  let digits = String(value == null ? "" : value).replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
}

/**
 * Valida o payload do formulário.
 * Retorna { ok, lead } | { ok: false, errors } | { ok: false, spam: true }.
 */
function validateLead(input, { now = Date.now(), minFillMs = 2500 } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: { form: "Dados inválidos." } };
  }

  // Honeypot e tempo mínimo de preenchimento: sinais típicos de robôs.
  const honeypot = typeof input.website === "string" ? input.website.trim() : "";
  const ts = Number(input.ts);
  const elapsed = Number.isFinite(ts) && ts > 0 ? now - ts : null;
  if (honeypot || (elapsed !== null && (elapsed < minFillMs || elapsed > 24 * 60 * 60 * 1000))) {
    return { ok: false, spam: true };
  }

  const errors = {};
  const nome = cleanText(input.nome, 80);
  if (nome.length < 2 || !/\p{L}/u.test(nome)) errors.nome = "Informe seu nome.";

  const telefone = normalizePhone(input.telefone);
  if (!/^[1-9]{2}9?\d{8}$/.test(telefone)) errors.telefone = "Informe um WhatsApp válido com DDD.";

  const interesse = Object.hasOwn(INTERESSES, input.interesse) ? input.interesse : "avaliacao";
  const periodo = Object.hasOwn(PERIODOS, input.periodo) ? input.periodo : "qualquer";

  const consent = input.consentimento === true || input.consentimento === "sim" || input.consentimento === "on";
  if (!consent) errors.consentimento = "É necessário autorizar o contato.";

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    lead: {
      id: crypto.randomUUID(),
      createdAt: new Date(now).toISOString(),
      nome: neutralizeFormula(nome),
      telefone,
      interesse,
      interesseLabel: INTERESSES[interesse],
      periodo,
      periodoLabel: PERIODOS[periodo],
      consentimento: { aceito: true, versao: "2026-10", em: new Date(now).toISOString() }
    }
  };
}

function whatsappLink(number, lead) {
  const nome = lead.nome.replace(/^'/, "");
  const text =
    `Olá, Dra. Letícia! Meu nome é ${nome}. Vim pelo site e gostaria de agendar uma avaliação.` +
    `\nInteresse: ${lead.interesseLabel}\nMelhor período: ${lead.periodoLabel}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

function createLeadStore({ dataDir, webhookUrl = "", webhookToken = "", logger = console }) {
  const file = path.join(dataDir, "leads.ndjson");
  let ready = null;

  function ensureDir() {
    if (!ready) {
      ready = fs.promises.mkdir(dataDir, { recursive: true, mode: 0o700 });
    }
    return ready;
  }

  async function forward(lead) {
    if (!webhookUrl) return;
    const headers = { "Content-Type": "application/json" };
    if (webhookToken) headers.Authorization = `Bearer ${webhookToken}`;
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(lead),
        redirect: "error",
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) logger.warn(`[leads] webhook respondeu ${res.status} para o lead ${lead.id}`);
    } catch (err) {
      logger.warn(`[leads] falha ao encaminhar lead ${lead.id}: ${err.name}`);
    }
  }

  async function save(lead) {
    await ensureDir();
    // NDJSON: um JSON por linha, arquivo legível apenas pelo dono do processo.
    await fs.promises.appendFile(file, JSON.stringify(lead) + "\n", { mode: 0o600 });
    // Não registra dados pessoais nos logs (LGPD): apenas o identificador.
    logger.info(`[leads] novo lead ${lead.id} (${lead.interesse})`);
    forward(lead);
  }

  return { save, file };
}

module.exports = { validateLead, whatsappLink, createLeadStore, cleanText, normalizePhone, INTERESSES, PERIODOS };
