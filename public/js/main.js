/* Divina Pele – interações do site (sem dependências externas). */
(function () {
  "use strict";

  // Configurações centrais do site. Ajuste aqui sem mexer no HTML.
  var CONFIG = {
    whatsapp: "5548988097020",
    defaultMessage: "Olá, Dra. Letícia! Vim pelo site e gostaria de agendar uma avaliação.",
    topicMessage: "Olá, Dra. Letícia! Vim pelo site e gostaria de saber mais sobre {topic}.",
    instagramUrl: "", // ex.: "https://www.instagram.com/perfil_da_clinica/"
    registroProfissional: "", // ex.: "CRM/SC 00000" — exigido em publicidade de saúde
    leadEndpoint: "/api/leads",
    leadTimeoutMs: 4000
  };

  var doc = document.documentElement;
  doc.classList.add("js");

  /* ---------- Rastreamento de conversões (GTM/GA4/Meta via dataLayer) ---------- */
  window.dataLayer = window.dataLayer || [];
  function track(event, params) {
    var payload = { event: event };
    if (params) for (var k in params) payload[k] = params[k];
    window.dataLayer.push(payload);
  }

  function waUrl(message) {
    return "https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(message);
  }

  /* ---------- Links de WhatsApp com mensagem contextual ---------- */
  document.querySelectorAll("[data-wa]").forEach(function (el) {
    var topic = el.getAttribute("data-wa-topic");
    var msg = topic ? CONFIG.topicMessage.replace("{topic}", topic) : CONFIG.defaultMessage;
    el.setAttribute("href", waUrl(msg));
    el.addEventListener("click", function () {
      track("whatsapp_click", { cta_source: el.getAttribute("data-wa-source") || "", topic: topic || "" });
    });
  });

  document.querySelectorAll("[data-track]").forEach(function (el) {
    el.addEventListener("click", function () { track(el.getAttribute("data-track")); });
  });

  if (CONFIG.instagramUrl) {
    document.querySelectorAll("[data-instagram]").forEach(function (el) { el.href = CONFIG.instagramUrl; });
  }
  if (CONFIG.registroProfissional) {
    document.querySelectorAll("[data-registro]").forEach(function (el) { el.textContent = " · " + CONFIG.registroProfissional; });
  }
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  /* ---------- Header e CTA fixo ---------- */
  var header = document.querySelector("[data-header]");
  var sticky = document.querySelector("[data-sticky-cta]");
  var hero = document.getElementById("inicio");
  var contact = document.getElementById("contato");
  var ticking = false;

  function onScroll() {
    var y = window.scrollY;
    if (header) header.classList.toggle("is-scrolled", y > 24);
    if (sticky && hero) {
      var pastHero = y > hero.offsetHeight * 0.6;
      var atContact = false;
      if (contact) {
        var r = contact.getBoundingClientRect();
        atContact = r.top < window.innerHeight * 0.6 && r.bottom > 0;
      }
      sticky.classList.toggle("is-visible", pastHero && !atContact);
    }
    ticking = false;
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  /* ---------- Menu mobile ---------- */
  var toggle = document.querySelector("[data-nav-toggle]");
  var nav = document.querySelector("[data-nav]");
  function setMenu(open) {
    if (!toggle || !nav) return;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    nav.classList.toggle("is-open", open);
  }
  if (toggle && nav) {
    toggle.addEventListener("click", function () { setMenu(toggle.getAttribute("aria-expanded") !== "true"); });
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });
  }

  /* ---------- Animações de entrada ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("is-visible"); io.unobserve(entry.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* ---------- FAQ: mantém apenas um item aberto ---------- */
  var faqItems = document.querySelectorAll(".faq details");
  faqItems.forEach(function (d) {
    d.addEventListener("toggle", function () {
      if (!d.open) return;
      track("faq_open", { question: d.querySelector("summary").textContent });
      faqItems.forEach(function (o) { if (o !== d) o.open = false; });
    });
  });

  /* ---------- Mapa sob demanda (privacidade + performance) ---------- */
  var mapBox = document.querySelector("[data-map]");
  var mapBtn = document.querySelector("[data-map-load]");
  if (mapBox && mapBtn) {
    mapBtn.addEventListener("click", function () {
      var iframe = document.createElement("iframe");
      iframe.src = "https://www.google.com/maps?q=" +
        encodeURIComponent("Rua Evaldo Carlos Baash, 158, Centro, Palhoça - SC, 88130-170") + "&output=embed";
      iframe.title = "Mapa: Divina Pele – Rua Evaldo Carlos Baash, 158, Palhoça/SC";
      iframe.loading = "lazy";
      iframe.referrerPolicy = "no-referrer-when-downgrade";
      iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
      mapBox.appendChild(iframe);
      mapBox.classList.add("is-loaded");
      track("map_load");
    });
  }

  /* ---------- Máscara de telefone ---------- */
  function formatPhone(v) {
    var d = v.replace(/\D/g, "");
    if (d.length > 11 && d.indexOf("55") === 0) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d.length ? "(" + d : "";
    if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
    if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  }
  document.querySelectorAll("[data-phone-mask]").forEach(function (input) {
    input.addEventListener("input", function () { input.value = formatPhone(input.value); });
  });

  /* ---------- Formulário de agendamento ---------- */
  var form = document.querySelector("[data-lead-form]");
  if (!form) return;

  var tsField = form.querySelector("[data-form-ts]");
  if (tsField) tsField.value = String(Date.now());
  var started = false;
  form.addEventListener("focusin", function () {
    if (!started) { started = true; track("form_start"); }
  });

  function setError(input, msg) {
    var err = document.getElementById(input.id + "-err");
    if (err) err.textContent = msg || "";
    if (msg) {
      input.setAttribute("aria-invalid", "true");
      if (err) input.setAttribute("aria-describedby", err.id);
    } else {
      input.removeAttribute("aria-invalid");
    }
  }

  function validate() {
    var ok = true;
    var nome = form.elements.nome;
    var tel = form.elements.telefone;
    var lgpd = form.elements.consentimento;
    var nomeVal = nome.value.trim();
    var telDigits = tel.value.replace(/\D/g, "");

    if (nomeVal.length < 2) { setError(nome, "Por favor, informe seu nome."); ok = false; } else setError(nome, "");
    if (telDigits.length < 10 || telDigits.length > 11) { setError(tel, "Informe um WhatsApp válido com DDD."); ok = false; } else setError(tel, "");
    if (!lgpd.checked) { setError(lgpd, "É necessário autorizar o contato para continuar."); ok = false; } else setError(lgpd, "");

    if (!ok) {
      var first = form.querySelector('[aria-invalid="true"]');
      if (first) first.focus();
    }
    return ok;
  }

  function buildMessage(data) {
    var interesse = form.elements.interesse;
    var periodo = form.elements.periodo;
    var interesseTxt = interesse.options[interesse.selectedIndex].text;
    var periodoTxt = periodo.options[periodo.selectedIndex].text;
    return "Olá, Dra. Letícia! Meu nome é " + data.nome + ". Vim pelo site e gostaria de agendar uma avaliação." +
      "\nInteresse: " + interesseTxt + "\nMelhor período: " + periodoTxt;
  }

  var status = form.querySelector("[data-form-status]");
  var submitBtn = form.querySelector("[data-submit]");
  var submitLabel = form.querySelector("[data-submit-label]");
  var sending = false;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending || !validate()) return;

    var data = {
      nome: form.elements.nome.value.trim(),
      telefone: form.elements.telefone.value.replace(/\D/g, ""),
      interesse: form.elements.interesse.value,
      periodo: form.elements.periodo.value,
      consentimento: form.elements.consentimento.checked,
      website: form.elements.website.value,
      ts: Number(tsField ? tsField.value : 0)
    };
    var target = waUrl(buildMessage(data));

    sending = true;
    submitBtn.disabled = true;
    submitLabel.textContent = "Enviando…";

    var controller = "AbortController" in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, CONFIG.leadTimeoutMs);

    // O lead é registrado no servidor; se a API não estiver disponível
    // (ex.: hospedagem estática), o usuário segue para o WhatsApp mesmo assim.
    fetch(CONFIG.leadEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(data),
      credentials: "same-origin",
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; })
      .then(function (json) {
        clearTimeout(timer);
        if (json && typeof json.whatsapp === "string" && json.whatsapp.indexOf("https://wa.me/") === 0) target = json.whatsapp;
        track("generate_lead", { interesse: data.interesse, periodo: data.periodo });
        status.textContent = "Tudo certo! Estamos abrindo o WhatsApp para você…";
        submitLabel.textContent = "Abrindo WhatsApp…";
        window.location.href = target;
        setTimeout(function () {
          sending = false;
          submitBtn.disabled = false;
          submitLabel.textContent = "Continuar no WhatsApp";
        }, 2500);
      });
  });
})();
