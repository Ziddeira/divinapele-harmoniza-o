# Divina Pele – Dra. Letícia Sebem · Site institucional

Site de alta conversão da clínica **Divina Pele – Dra. Letícia Sebem | Harmonização Facial**
(Rua Evaldo Carlos Baash, 158, sala 702 – Centro Executivo Nest, Palhoça/SC).

- **Frontend:** HTML semântico, CSS e JavaScript puros, sem frameworks e sem scripts de terceiros.
- **Backend:** Node.js (≥ 20) **sem dependências npm**: serve o site e recebe os leads do formulário.
- **Conversão:** todos os CTAs levam ao WhatsApp com mensagem pré-preenchida e contextual.

## Estrutura

```
public/                    # tudo o que é publicado
  index.html               # landing page
  politica-de-privacidade.html
  404.html
  css/styles.css
  js/main.js               # CONFIG no topo: WhatsApp, Instagram, registro profissional
  assets/img/              # fotos otimizadas em WebP (2 tamanhos cada) + logo SVG
  assets/fonts/            # EB Garamond + Jost (auto-hospedadas, licença OFL)
  _headers                 # cabeçalhos de segurança para Netlify/Cloudflare Pages
server/
  server.js                # servidor HTTP + rotas
  static.js                # arquivos estáticos (anti path traversal, ETag, brotli/gzip)
  leads.js                 # validação, anti-spam, gravação e webhook de leads
  security.js              # CSP e demais cabeçalhos de segurança
  rate-limit.js            # limite de envios por IP
  config.js                # variáveis de ambiente
test/server.test.js        # testes (node:test)
```

## Rodando

```bash
npm run dev        # desenvolvimento em http://localhost:3000 (recarrega ao salvar)
npm test           # testes automatizados
npm start          # produção (NODE_ENV=production)
```

Ou com Docker:

```bash
docker build -t divinapele .
docker run -p 3000:3000 --env-file .env -v divinapele-data:/app/data divinapele
```

Configure as variáveis a partir de `.env.example`. **Em produção**, defina `ALLOWED_ORIGINS` com o domínio real
e `TRUST_PROXY=1` se houver proxy/CDN na frente.

### Hospedagem só estática (Netlify, Cloudflare Pages, Vercel, GitHub Pages)

A pasta `public/` funciona sozinha. Sem o backend, o formulário continua levando o paciente ao WhatsApp com
todos os dados; apenas o registro do lead no servidor deixa de acontecer.

## Conversão: o que foi aplicado

- Hero com promessa clara, prova social logo de início (nota 5,0 · 124 avaliações) e CTA principal.
- Quebra da principal objeção ("medo de ficar artificial") usando um depoimento real.
- CTA de WhatsApp em cada tratamento, com a mensagem já citando o procedimento de interesse.
- Barra de CTA fixa no celular (WhatsApp + ligar) e botão flutuante no desktop.
- Formulário curto (nome + WhatsApp) que registra o lead e abre a conversa no WhatsApp.
- FAQ que responde às objeções (dor, durabilidade, preço, localização).
- Eventos no `window.dataLayer` prontos para GTM/GA4/Meta: `whatsapp_click`, `generate_lead`,
  `form_start`, `phone_click`, `faq_open`, `map_load`, `directions_click`, `google_reviews_click`.
  Para adicionar o GTM ou o Pixel, inclua os domínios deles na CSP (`server/security.js` e `public/_headers`)
  e implemente um banner de consentimento de cookies (LGPD).

## Segurança

- CSP restritiva (`script-src 'self'`, sem inline), `frame-ancestors 'none'`, HSTS, nosniff, COOP/CORP,
  Referrer-Policy e Permissions-Policy.
- API de leads: verificação de origem (CSRF), apenas `application/json` ou formulário, corpo limitado a 8 KB,
  rate limit por IP, honeypot e tempo mínimo de preenchimento contra robôs.
- Validação estrita no servidor: listas fechadas para os campos de seleção, normalização Unicode, remoção de
  caracteres de controle e proteção contra *CSV/formula injection*.
- Leads gravados em `data/leads.ndjson` com permissão `600`. Os logs não contêm dados pessoais (LGPD).
- Servidor de estáticos protegido contra path traversal, symlinks e arquivos ocultos (`.env`, `.git`),
  com timeouts contra *slowloris*.
- Nenhuma dependência npm, então não há riscos de cadeia de suprimentos. O Docker roda como usuário sem privilégios.
- O mapa do Google só carrega após clique (privacidade e desempenho). O site não usa cookies.

## ⚠️ Pendências antes de publicar

1. **Domínio:** o site usa `https://www.divinapele.com.br` (canonical, Open Graph, sitemap, JSON-LD).
   Substitua pelo domínio real em `public/index.html`, `public/sitemap.xml`, `public/robots.txt` e
   `public/politica-de-privacidade.html`.
2. **Instagram:** preencha `instagramUrl` no `CONFIG` de `public/js/main.js`.
3. **Registro profissional:** a publicidade em saúde exige o número de registro da responsável técnica
   (CRM/CRO/CRBM etc.). Preencha `registroProfissional` no `CONFIG` de `public/js/main.js`.
4. **Tratamentos:** confirme com a clínica a lista de procedimentos e os textos da seção “Tratamentos”.
5. **Depoimentos:** foram usados trechos públicos do Google, identificados apenas pelo primeiro nome e pela inicial.
   Recomenda-se pedir autorização aos autores.
6. Evite publicar fotos de “antes e depois” e promessas de resultado: os conselhos profissionais restringem esse tipo de conteúdo.
