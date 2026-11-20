import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const baseUrl = (process.env.SITE_BASE_URL || "https://example.com").replace(/\/$/, "");
const today = "2026-10-13";

const pt = readJson("locales/pt/common.json");
const en = readJson("locales/en/common.json");
const locales = { pt, en };

const pages = {
  home: {
    parent: "home",
    image: "carousel-2.jpg",
    slugs: { pt: "index", en: "index" },
    render: renderHome
  },
  team: {
    parent: "about",
    image: "about.jpg",
    slugs: { pt: "equipa", en: "team" },
    render: renderTeamPage
  },
  about: {
    parent: "about",
    image: "about.jpg",
    slugs: { pt: "sobre", en: "about" },
    render: renderAbout
  },
  solutions: {
    parent: "solutions",
    image: "feature.jpg",
    slugs: { pt: "solucoes", en: "solutions" },
    render: renderSolutions
  },
  biogas: {
    parent: "solutions",
    image: "img-600x400-4.jpg",
    slugs: { pt: "biogas", en: "biogas" },
    render: renderBiogas
  },
  solar: {
    parent: "solutions",
    image: "img-600x400-1.jpg",
    slugs: { pt: "solar", en: "solar" },
    render: renderSolar
  },
  biofertilizer: {
    parent: "solutions",
    image: "img-600x400-5.jpg",
    slugs: { pt: "biofertilizante", en: "biofertilizer" },
    render: renderBiofertilizer
  },
  wastewater: {
    parent: "solutions",
    image: "img-600x400-6.jpg",
    slugs: { pt: "tratamento-de-aguas-residuais", en: "wastewater-treatment" },
    render: renderWastewater
  },
  who: {
    parent: "who",
    image: "img-600x400-2.jpg",
    slugs: { pt: "quem-servimos", en: "who-we-serve" },
    render: renderWho
  },
  products: {
    parent: "products",
    image: "img-600x400-3.jpg",
    slugs: { pt: "produtos", en: "products" },
    render: renderProductsPage
  },
  partnerships: {
    parent: "partnerships",
    image: "quote.jpg",
    slugs: { pt: "parcerias", en: "partnerships" },
    render: renderPartnerships
  },
  impact: {
    parent: "impact",
    image: "carousel-1.jpg",
    slugs: { pt: "impacto", en: "impact" },
    render: renderImpact
  },
  resources: {
    parent: "resources",
    image: "img-600x400-6.jpg",
    slugs: { pt: "recursos", en: "resources" },
    render: renderResources
  },
  faq: {
    parent: "resources",
    image: "img-600x400-6.jpg",
    slugs: { pt: "perguntas-frequentes", en: "frequently-asked-questions" },
    render: renderFaq
  },
  articles: {
    parent: "resources",
    image: "img-600x400-6.jpg",
    slugs: { pt: "artigos", en: "articles" },
    render: renderArticlesPage
  },
  article: {
    parent: "resources",
    image: "img-600x400-6.jpg",
    slugs: { pt: "artigo", en: "article" },
    render: renderArticlePage
  },
  contact: {
    parent: "contact",
    image: "carousel-2.jpg",
    slugs: { pt: "contacto", en: "contact" },
    render: renderContact
  }
};

ensureDir("pt");
ensureDir("en");

writeSharedPartials();

for (const [pageKey, page] of Object.entries(pages)) {
  for (const locale of Object.keys(locales)) {
    const html = renderPage(locale, pageKey, page);
    const fileName = page.slugs[locale] === "index" ? "index.html" : `${page.slugs[locale]}.html`;
    writeFile(path.join(locale, fileName), html);
  }
}

writeFile("index.html", renderRootRedirect());
writeLegacyRedirects();
writeFile("sitemap.xml", renderSitemap());
writeFile("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function ensureDir(relativePath) {
  fs.mkdirSync(path.join(root, relativePath), { recursive: true });
}

function writeFile(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function get(source, dotted) {
  return dotted.split(".").reduce((value, part) => {
    if (value && Object.prototype.hasOwnProperty.call(value, part)) {
      return value[part];
    }
    return undefined;
  }, source);
}

function text(locale, dotted) {
  const value = get(locales[locale], dotted);
  if (value !== undefined) return value;
  const fallback = get(pt, dotted);
  return fallback !== undefined ? fallback : "";
}

function pageData(locale, pageKey) {
  return text(locale, `pages.${pageKey}`);
}

function pagePath(locale, pageKey) {
  const slug = pages[pageKey].slugs[locale];
  return slug === "index" ? `/${locale}/` : `/${locale}/${slug}.html`;
}

function relativePagePath(fromLocale, toLocale, pageKey) {
  const slug = pages[pageKey].slugs[toLocale];
  return slug === "index" ? `../${toLocale}/` : `../${toLocale}/${slug}.html`;
}

function absolutePageUrl(locale, pageKey) {
  return `${baseUrl}${pagePath(locale, pageKey)}`;
}

function renderPage(locale, pageKey, page) {
  const data = pageData(locale, pageKey);
  const body = page.render(locale, data);
  const title = data.metaTitle || text(locale, "brand.name");
  const description = data.metaDescription || text(locale, "brand.tagline");

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${absolutePageUrl(locale, pageKey)}">
    <link rel="alternate" hreflang="pt" href="${absolutePageUrl("pt", pageKey)}">
    <link rel="alternate" hreflang="en" href="${absolutePageUrl("en", pageKey)}">
    <link rel="alternate" hreflang="x-default" href="${absolutePageUrl("pt", pageKey)}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;700&family=Roboto:wght@500;700;900&display=swap" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.10.0/css/all.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.4.1/font/bootstrap-icons.css" rel="stylesheet">
    <link href="../css/bootstrap.min.css" rel="stylesheet">
    <link href="../css/style.css" rel="stylesheet">
</head>
<body data-locale="${locale}" data-locale-root="../locales" data-page-key="${pageKey}" data-active-parent="${page.parent}" data-alt-pt="${relativePagePath(locale, "pt", pageKey)}" data-alt-en="${relativePagePath(locale, "en", pageKey)}">
    <div data-site-partial="header" data-site-partial-src="header.html"></div>
    ${pageKey === "home" ? "" : renderPageHeader(locale, data, page.image)}
    <main>
${body}
    </main>
    <div data-site-partial="footer" data-site-partial-src="footer.html"></div>
    <a href="#" class="btn btn-lg btn-primary btn-lg-square rounded-circle back-to-top" aria-label="Back to top"><i class="bi bi-arrow-up"></i></a>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.0.0/dist/js/bootstrap.bundle.min.js" defer></script>
    <script src="https://unpkg.com/i18next@23.16.8/dist/umd/i18next.min.js" defer></script>
    <script src="../js/config.js" defer></script>
    <script src="../js/site-i18n.js${pageKey === "faq" ? "?v=faqs" : ""}" defer></script>
    ${["articles", "article"].includes(pageKey) ? `<script src="../js/articles.js" defer></script>` : ""}
    ${pageKey === "team" ? `<script src="../js/team.js" defer></script>` : ""}
    ${pageKey === "products" ? `<script src="../js/products.js" defer></script>` : ""}
</body>
</html>
`;
}

function writeSharedPartials() {
  for (const locale of Object.keys(locales)) {
    writeFile(path.join(locale, "header.html"), renderHeaderPartial(locale));
    writeFile(path.join(locale, "footer.html"), renderFooter(locale));
  }
  writeFile("whistle-header.html", renderRootPartial(renderHeaderPartial("en")));
  writeFile("whistle-footer.html", renderRootPartial(renderFooter("en")));
}

function renderRootPartial(html) {
  return html.replace(/href="([^"]*)"/g, (_match, href) => {
    if (href.startsWith("../whistleblowing")) return `href="${href.slice(3)}"`;
    if (href.startsWith("../pt/") || href.startsWith("../en/")) return `href="${href.slice(3)}"`;
    if (/^(?:https?:|#|mailto:|tel:|javascript:)/i.test(href)) return `href="${href}"`;
    return `href="en/${href}"`;
  });
}

function renderHeaderPartial(locale) {
  return `${renderTopbar(locale)}
    ${renderNav(locale)}`;
}

function renderTopbar(locale) {
  return `<div class="container-fluid bg-dark p-0">
        <div class="row gx-0 d-none d-lg-flex">
            <div class="col-lg-8 px-5 text-start">
                <div class="h-100 d-inline-flex align-items-center me-4">
                    <small class="fa fa-map-marker-alt text-primary me-2"></small>
                    <small data-company="address" data-i18n="topbar.serviceArea">${escapeHtml(text(locale, "topbar.serviceArea"))}</small>
                </div>
                <div class="h-100 d-inline-flex align-items-center">
                    <small class="far fa-clock text-primary me-2"></small>
                    <small data-i18n="topbar.hours">${escapeHtml(text(locale, "topbar.hours"))}</small>
                </div>
            </div>
            <div class="col-lg-4 px-5 text-end">
                <div class="h-100 d-inline-flex align-items-center">
                    <small class="fa fa-phone-alt text-primary me-2"></small>
                    <a href="#" class="text-light" data-company-link="phone"><small data-company="phone" data-i18n="topbar.phone">${escapeHtml(text(locale, "topbar.phone"))}</small></a>
                </div>
            </div>
        </div>
    </div>`;
}

function renderNav(locale) {
  const solutionLinks = [
    ["solutions", "nav.solutions"],
    ["biogas", "nav.biogas"],
    ["solar", "nav.solar"],
    ["biofertilizer", "nav.biofertilizer"],
    ["wastewater", "nav.wastewater"],
    ["products", "nav.products"]
  ];
  const resourceLinks = [
    ["resources", "nav.resources"],
    ["faq", "nav.faq"],
    ["articles", "nav.articles"]
  ];

  return `<nav class="navbar navbar-expand-xl bg-white navbar-light sticky-top p-0 shadow-sm">
        <a href="index.html" class="navbar-brand d-flex align-items-center border-end px-3 px-lg-5">
            <span class="brand-mark" aria-hidden="true"><i class="fa fa-leaf"></i></span>
            <span>
                <span class="brand-name" data-i18n="brand.name">${escapeHtml(text(locale, "brand.name"))}</span>
                <span class="brand-subtitle" data-i18n="brand.tagline">${escapeHtml(text(locale, "brand.tagline"))}</span>
            </span>
        </a>
        <button type="button" class="navbar-toggler me-4" data-bs-toggle="collapse" data-bs-target="#navbarCollapse" aria-label="${escapeHtml(text(locale, "nav.menu"))}">
            <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarCollapse">
            <div class="navbar-nav ms-auto p-4 p-lg-0">
                ${navItem(locale, "home", "nav.home")}
                <div class="nav-item dropdown">
                    <a href="${localHref(locale, "about")}" class="nav-link dropdown-toggle" data-nav-parent="about" data-bs-toggle="dropdown" data-i18n="nav.about">${escapeHtml(text(locale, "nav.about"))}</a>
                    <div class="dropdown-menu bg-light m-0">
                        <a href="${localHref(locale, "about")}" class="dropdown-item" data-nav-page="about" data-i18n="nav.about">${escapeHtml(text(locale, "nav.about"))}</a>
                        <a href="${localHref(locale, "team")}" class="dropdown-item" data-nav-page="team" data-i18n="nav.team">${escapeHtml(text(locale, "nav.team"))}</a>
                    </div>
                </div>
                <div class="nav-item dropdown">
                    <a href="${localHref(locale, "solutions")}" class="nav-link dropdown-toggle" data-nav-parent="solutions" data-bs-toggle="dropdown" data-i18n="nav.solutions">${escapeHtml(text(locale, "nav.solutions"))}</a>
                    <div class="dropdown-menu bg-light m-0">
                        ${solutionLinks.map(([key, label]) => `<a href="${localHref(locale, key)}" class="dropdown-item" data-nav-page="${key}" data-i18n="${label}">${escapeHtml(text(locale, label))}</a>`).join("")}
                    </div>
                </div>
                ${navItem(locale, "who", "nav.who")}
                ${navItem(locale, "partnerships", "nav.partnerships")}
                ${navItem(locale, "impact", "nav.impact")}
                <div class="nav-item dropdown">
                    <a href="${localHref(locale, "resources")}" class="nav-link dropdown-toggle" data-nav-parent="resources" data-bs-toggle="dropdown" data-i18n="nav.resources">${escapeHtml(text(locale, "nav.resources"))}</a>
                    <div class="dropdown-menu bg-light m-0">
                        ${resourceLinks.map(([key, label]) => `<a href="${localHref(locale, key)}" class="dropdown-item" data-nav-page="${key}" data-i18n="${label}">${escapeHtml(text(locale, label))}</a>`).join("")}
                    </div>
                </div>
                ${navItem(locale, "contact", "nav.contact")}
                <div class="nav-item dropdown">
                    <a href="../whistleblowing.html" class="nav-link dropdown-toggle" data-nav-parent="whistleblowing" data-bs-toggle="dropdown" data-i18n="nav.whistleblowing">${escapeHtml(text(locale, "nav.whistleblowing"))}</a>
                    <div class="dropdown-menu bg-light m-0">
                        <a href="../whistleblowing.html" class="dropdown-item" data-i18n="nav.whistleblowingOverview">${escapeHtml(text(locale, "nav.whistleblowingOverview"))}</a>
                        <a href="../whistleblowing-submit.html" class="dropdown-item" data-i18n="nav.whistleblowingNew">${escapeHtml(text(locale, "nav.whistleblowingNew"))}</a>
                        <a href="../whistleblowing-followup.html" class="dropdown-item" data-i18n="nav.whistleblowingFollowUp">${escapeHtml(text(locale, "nav.whistleblowingFollowUp"))}</a>
                    </div>
                </div>
            </div>
            <div class="d-flex align-items-center language-switch px-4 px-lg-3 pb-4 pb-lg-0">
                <a href="../pt/" class="${locale === "pt" ? "active" : ""}" data-switch-locale="pt" hreflang="pt">PT</a>
                <a href="../en/" class="${locale === "en" ? "active" : ""}" data-switch-locale="en" hreflang="en">EN</a>
            </div>
            <a href="${localHref(locale, "contact")}#assessment" class="btn btn-primary rounded-0 py-4 px-lg-4 d-none d-xxl-block" data-i18n="actions.requestAssessment">${escapeHtml(text(locale, "actions.requestAssessment"))}<i class="fa fa-arrow-right ms-3"></i></a>
        </div>
    </nav>`;
}

function navItem(locale, key, label) {
  return `<a href="${localHref(locale, key)}" class="nav-item nav-link" data-nav-page="${key}" data-i18n="${label}">${escapeHtml(text(locale, label))}</a>`;
}

function localHref(locale, pageKey) {
  const slug = pages[pageKey].slugs[locale];
  return slug === "index" ? "index.html" : `${slug}.html`;
}

function renderPageHeader(locale, data, image) {
  return `<section class="container-fluid page-header py-5 mb-5" style="background-image: url('../img/${image}')">
        <div class="container py-5">
            <h1 class="display-4 mb-3">${escapeHtml(data.title)}</h1>
            <p class="fs-5 mb-0">${escapeHtml(data.intro || data.metaDescription || "")}</p>
        </div>
    </section>`;
}

function renderFooter(locale) {
  const year = "2026";
  return `<section class="partner-section container-xxl mt-5 py-5" data-partners-section hidden aria-label="${locale === "pt" ? "Parceiros" : "Partners"}">
        <div class="container">
            <div class="d-flex align-items-center justify-content-between gap-3 mb-4">
                <h2 class="h4 mb-0">${locale === "pt" ? "Os nossos parceiros" : "Our partners"}</h2>
                <div class="d-flex gap-2" data-partner-controls>
                    <button class="btn btn-outline-primary btn-sm" type="button" data-partner-prev aria-label="${locale === "pt" ? "Parceiros anteriores" : "Previous partners"}"><i class="fa fa-chevron-left" aria-hidden="true"></i></button>
                    <button class="btn btn-outline-primary btn-sm" type="button" data-partner-pause>${locale === "pt" ? "Pausar" : "Pause"}</button>
                    <button class="btn btn-outline-primary btn-sm" type="button" data-partner-next aria-label="${locale === "pt" ? "Próximos parceiros" : "Next partners"}"><i class="fa fa-chevron-right" aria-hidden="true"></i></button>
                </div>
            </div>
            <div class="partner-carousel" data-partner-track role="region" aria-roledescription="carousel" aria-label="${locale === "pt" ? "Logótipos dos parceiros" : "Partner logos"}"></div>
        </div>
    </section>
    <footer class="container-fluid bg-dark footer mt-5 pt-5">
        <div class="container py-5">
            <div class="row g-5">
                <div class="col-lg-4 col-md-6">
                    <h5 class="text-white mb-4" data-i18n="brand.name">${escapeHtml(text(locale, "brand.name"))}</h5>
                    <p data-i18n="footer.about">${escapeHtml(text(locale, "footer.about"))}</p>
                    <p class="pending mb-0" data-i18n="brand.workingNameNotice">${escapeHtml(text(locale, "brand.workingNameNotice"))}</p>
                </div>
                <div class="col-lg-2 col-md-6">
                    <h5 class="text-white mb-4" data-i18n="footer.quickLinks">${escapeHtml(text(locale, "footer.quickLinks"))}</h5>
                    <a class="btn btn-link" href="${localHref(locale, "about")}" data-i18n="nav.about">${escapeHtml(text(locale, "nav.about"))}</a>
                    <a class="btn btn-link" href="${localHref(locale, "team")}" data-i18n="nav.team">${escapeHtml(text(locale, "nav.team"))}</a>
                    <a class="btn btn-link" href="${localHref(locale, "who")}" data-i18n="nav.who">${escapeHtml(text(locale, "nav.who"))}</a>
                    <a class="btn btn-link" href="${localHref(locale, "partnerships")}" data-i18n="nav.partnerships">${escapeHtml(text(locale, "nav.partnerships"))}</a>
                    <a class="btn btn-link" href="${localHref(locale, "contact")}" data-i18n="nav.contact">${escapeHtml(text(locale, "nav.contact"))}</a>
                    <a class="btn btn-link" href="../whistleblowing.html" data-i18n="nav.whistleblowing">${escapeHtml(text(locale, "nav.whistleblowing"))}</a>
                </div>
                <div class="col-lg-3 col-md-6">
                    <h5 class="text-white mb-4" data-i18n="footer.solutions">${escapeHtml(text(locale, "footer.solutions"))}</h5>
                    <a class="btn btn-link" href="${localHref(locale, "biogas")}" data-i18n="nav.biogas">${escapeHtml(text(locale, "nav.biogas"))}</a>
                    <a class="btn btn-link" href="${localHref(locale, "solar")}" data-i18n="nav.solar">${escapeHtml(text(locale, "nav.solar"))}</a>
                    <a class="btn btn-link" href="${localHref(locale, "biofertilizer")}" data-i18n="nav.biofertilizer">${escapeHtml(text(locale, "nav.biofertilizer"))}</a>
                    <a class="btn btn-link" href="${localHref(locale, "impact")}" data-i18n="nav.impact">${escapeHtml(text(locale, "nav.impact"))}</a>
                </div>
                <div class="col-lg-3 col-md-6">
                    <h5 class="text-white mb-4" data-i18n="footer.contactTitle">${escapeHtml(text(locale, "footer.contactTitle"))}</h5>
                    <p data-company="address" data-i18n="footer.contactPending">${escapeHtml(text(locale, "footer.contactPending"))}</p>
                    <p><a href="#" data-company-link="phone" aria-label="Phone"><i class="fa fa-phone-alt me-2"></i><span data-company="phone"></span></a></p>
                    <p><a href="#" data-company-link="whatsapp" aria-label="WhatsApp"><i class="fab fa-whatsapp me-2"></i><span data-company="whatsapp">WhatsApp</span></a></p>
                    <div class="d-flex gap-2 mb-3">${["facebook", "linkedin", "youtube", "twitter"].map(network => `<a class="btn btn-outline-light btn-square" href="#" data-company-link="${network}" aria-label="${network}"><i class="fab fa-${network}"></i></a>`).join("")}</div>
                    <a class="btn btn-link" href="${localHref(locale, "resources")}#privacy" data-i18n="footer.privacy">${escapeHtml(text(locale, "footer.privacy"))}</a>
                    <a class="btn btn-link" href="${localHref(locale, "resources")}#legal" data-i18n="footer.legal">${escapeHtml(text(locale, "footer.legal"))}</a>
                </div>
            </div>
        </div>
        <div class="container">
            <div class="copyright">
                <div class="row">
                    <div class="col-md-6 text-center text-md-start mb-3 mb-md-0">
                        &copy; ${year} <a href="index.html" data-i18n="brand.name">${escapeHtml(text(locale, "brand.name"))}</a>. <span data-i18n="footer.rights">${escapeHtml(text(locale, "footer.rights"))}</span>
                    </div>
                    <div class="col-md-6 text-center text-md-end" data-i18n="footer.credit">${escapeHtml(text(locale, "footer.credit"))}</div>
                </div>
            </div>
        </div>
    </footer>`;
}

function renderHome(locale, data) {
  return `        <section class="hero" style="background-image: url('../img/carousel-2.jpg')">
            <div class="container py-5">
                <span class="eyebrow">${escapeHtml(data.heroEyebrow)}</span>
                <h1 class="display-3 mt-3 mb-4">${escapeHtml(data.heroTitle)}</h1>
                <p class="fs-5 mb-4">${escapeHtml(data.heroText)}</p>
                <div class="d-flex flex-wrap gap-3">
                    <a href="${localHref(locale, "solutions")}" class="btn btn-primary py-3 px-5" data-i18n="actions.exploreSolutions">${escapeHtml(text(locale, "actions.exploreSolutions"))}</a>
                    <a href="${localHref(locale, "contact")}" class="btn btn-gold py-3 px-5" data-i18n="actions.contactUs">${escapeHtml(text(locale, "actions.contactUs"))}</a>
                </div>
            </div>
        </section>
${sectionIntro(data.solutionsKicker, data.solutionsTitle)}
        <section class="container-xxl pb-5">
            <div class="container">
                <div class="row g-4">
                    ${data.solutionCards.map((card) => renderSolutionCard(locale, card)).join("")}
                </div>
            </div>
        </section>
        <section class="container-fluid bg-light overflow-hidden my-5 px-lg-0">
            <div class="container about px-lg-0">
                <div class="row g-0 mx-lg-0">
                    <div class="col-lg-6 ps-lg-0" style="min-height: 420px;">
                        <img class="img-fluid w-100 h-100" src="../img/about.jpg" style="object-fit: cover;" alt="${escapeHtml(data.whyTitle)}">
                    </div>
                    <div class="col-lg-6 about-text py-5">
                        <div class="p-lg-5 pe-lg-0">
                            <span class="section-kicker">${escapeHtml(data.whyKicker)}</span>
                            <h2 class="mb-4">${escapeHtml(data.whyTitle)}</h2>
                            <p class="mb-4">${escapeHtml(data.whyText)}</p>
                            ${listWithChecks(data.whyItems)}
                        </div>
                    </div>
                </div>
            </div>
        </section>
${sectionIntro(data.serveKicker, data.serveTitle)}
        <section class="container-xxl pb-5">
            <div class="container">
                <div class="row g-4">
                    ${data.serveCards.map((card) => `<div class="col-md-6 col-lg-3"><div class="audience-card p-4"><div class="icon-box"><i class="fa fa-users"></i></div><h3 class="h5">${escapeHtml(card.title)}</h3><p class="mb-0">${escapeHtml(card.text)}</p></div></div>`).join("")}
                </div>
            </div>
        </section>
        <section class="container-xxl py-5">
            <div class="container">
                <div class="row g-5 align-items-center">
                    <div class="col-lg-4">
                        <span class="section-kicker">${escapeHtml(data.circularKicker)}</span>
                        <h2 class="mb-4">${escapeHtml(data.circularTitle)}</h2>
                        <p>${escapeHtml(data.circularText)}</p>
                    </div>
                    <div class="col-lg-8">
                        <div class="circular-flow">
                            ${data.circularSteps.map((step, index) => `<div class="flow-step"><div class="icon-box"><i class="fa ${["fa-trash-alt", "fa-cogs", "fa-fire", "fa-seedling", "fa-hands-helping"][index]}"></i></div><h3 class="h6 mb-0">${escapeHtml(step)}</h3></div>`).join("")}
                        </div>
                    </div>
                </div>
            </div>
        </section>
        <section class="container-fluid bg-light py-5">
            <div class="container py-4">
                <div class="row g-5 align-items-center">
                    <div class="col-lg-6">
                        <span class="section-kicker">${escapeHtml(data.impactKicker)}</span>
                        <h2 class="mb-4">${escapeHtml(data.impactTitle)}</h2>
                        <p>${escapeHtml(data.impactText)}</p>
                    </div>
                    <div class="col-lg-6">
                        <ul class="sdg-list">
                            ${data.sdgs.map((sdg) => `<li>${escapeHtml(sdg)}</li>`).join("")}
                        </ul>
                    </div>
                </div>
            </div>
        </section>
        ${renderCta(locale, data.finalTitle, data.finalText)}`;
}

function renderAbout(locale, data) {
  return `        <section class="container-xxl py-5">
            <div class="container">
                <div class="row g-5">
                    <div class="col-lg-7">
                        <h2>${escapeHtml(data.storyTitle)}</h2>
                        <p>${escapeHtml(data.story)}</p>
                        <div class="row g-4 mt-2">
                            <div class="col-md-6"><div class="info-card p-4"><h3 class="h5">${escapeHtml(data.missionTitle)}</h3><p class="mb-0">${escapeHtml(data.mission)}</p></div></div>
                            <div class="col-md-6"><div class="info-card p-4"><h3 class="h5">${escapeHtml(data.visionTitle)}</h3><p class="mb-0">${escapeHtml(data.vision)}</p></div></div>
                        </div>
                    </div>
                    <div class="col-lg-5">
                        <div class="notice mb-4">${escapeHtml(text(locale, "brand.statusNotice"))}</div>
                        <div class="info-card p-4">
                            <h3 class="h5">${escapeHtml(data.valuesTitle)}</h3>
                            ${listWithChecks(data.values)}
                        </div>
                    </div>
                </div>
                <div class="notice mt-5">
                    <strong>${escapeHtml(data.credentialsTitle)}:</strong> ${escapeHtml(data.credentials)}
                </div>
            </div>
        </section>
        ${renderCta(locale, text(locale, "pages.home.finalTitle"), text(locale, "pages.home.finalText"))}`;
}

function renderSolutions(locale, data) {
  const cards = text(locale, "pages.home.solutionCards");
  return `${sectionIntro("", data.title, data.intro)}
        <section class="container-xxl pb-5">
            <div class="container">
                <div class="row g-4">
                    ${cards.map((card) => renderSolutionCard(locale, card)).join("")}
                </div>
            </div>
        </section>
        <section class="container-fluid bg-light py-5">
            <div class="container py-4">
                <div class="row g-5">
                    <div class="col-lg-6">
                        <h2>${escapeHtml(data.processTitle)}</h2>
                        ${numberedList(data.process)}
                    </div>
                    <div class="col-lg-6">
                        <div class="info-card p-4">
                            <div class="icon-box"><i class="fa fa-school"></i></div>
                            <h3>${escapeHtml(data.institutionalTitle)}</h3>
                            <p class="mb-0">${escapeHtml(data.institutionalText)}</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>`;
}

function renderBiogas(locale, data) {
  return `${contentGrid([
    contentBlock(data.howTitle, numberedList(data.how)),
    contentBlock(data.requirementsTitle, listWithChecks(data.requirements)),
    contentBlock(data.applicationsTitle, listWithChecks(data.applications)),
    contentBlock(data.safetyTitle, `<p class="mb-0">${escapeHtml(data.safety)}</p>`)
  ])}
        <section id="assessment" class="container-xxl py-5">
            <div class="container">
                ${leadForm(locale, "biogasTitle", ["name", "phone", "province", "district", "siteType", "livestock", "feedstockQty", "waterAccess", "currentFuel", "intendedUsers", "stage"])}
            </div>
        </section>`;
}

function renderWastewater(locale, data) {
  return `        <section class="container-xxl py-5">
            <div class="container">
                <div class="row g-5 align-items-start">
                    <div class="col-lg-5">
                        <span class="section-kicker">${escapeHtml(data.whatWeDoTitle)}</span>
                        <h2>${escapeHtml(data.title)}</h2>
                        <p class="mb-0">${escapeHtml(data.intro)}</p>
                    </div>
                    <div class="col-lg-7">
                        <div class="info-card p-4 p-lg-5">
                            <ul class="mb-0">${data.services.map((service) => `<li class="mb-2">${escapeHtml(service)}</li>`).join("")}</ul>
                        </div>
                    </div>
                </div>
            </div>
        </section>
        ${renderCta(locale, data.ctaTitle, data.ctaText)}`;
}

function renderSolar(locale, data) {
  return `        <section class="container-xxl py-5">
            <div class="container">
                <div class="row g-5">
                    <div class="col-lg-5">
                        <h2>${escapeHtml(data.selectionTitle)}</h2>
                        <p>${escapeHtml(data.selection)}</p>
                        <div class="notice">${escapeHtml(data.productsNotice)}</div>
                    </div>
                    <div class="col-lg-7">
                        <h2>${escapeHtml(data.productsTitle)}</h2>
                        <div class="row g-4">
                            ${data.products.map((product) => `<div class="col-md-6"><div class="info-card p-4"><div class="icon-box"><i class="fa fa-solar-panel"></i></div><h3 class="h5">${escapeHtml(product.name)}</h3><p>${escapeHtml(product.use)}</p><p class="mb-0"><strong>${escapeHtml(product.status)}</strong></p></div></div>`).join("")}
                        </div>
                    </div>
                </div>
            </div>
        </section>
        <section id="assessment" class="container-fluid bg-light py-5">
            <div class="container">
                ${leadForm(locale, "solarTitle", ["name", "phone", "province", "district", "lightingNeeds", "productInterest", "paymentPreference", "stage"])}
            </div>
        </section>`;
}

function renderBiofertilizer(locale, data) {
  return `${contentGrid([
    contentBlock(data.pathwayTitle, numberedList(data.pathway)),
    contentBlock(data.benefitsTitle, listWithChecks(data.benefits)),
    contentBlock("", `<div class="notice">${escapeHtml(data.caution)}</div>`)
  ])}
        ${renderCta(locale, text(locale, "actions.consultation"), text(locale, "pages.home.finalText"))}`;
}

function renderWho(locale, data) {
  return `        <section class="container-xxl py-5">
            <div class="container">
                <div class="row g-4">
                    ${data.segments.map((segment) => `<div class="col-md-6"><div class="audience-card p-4"><div class="icon-box"><i class="fa fa-user-friends"></i></div><h2 class="h4">${escapeHtml(segment.title)}</h2><p><strong>${escapeHtml(locale === "pt" ? "Necessidades" : "Needs")}:</strong> ${escapeHtml(segment.needs)}</p><p class="mb-0"><strong>${escapeHtml(locale === "pt" ? "Soluções" : "Solutions")}:</strong> ${escapeHtml(segment.solutions)}</p></div></div>`).join("")}
                </div>
            </div>
        </section>`;
}

function renderTeamPage(locale, data) {
  return `        <section class="container-xxl py-5">
            <div class="container">
                <div class="team-introduction mb-5">
                    <p class="text-primary fw-bold text-uppercase">${escapeHtml(data.eyebrow)}</p>
                    <h2>${escapeHtml(data.introTitle)}</h2>
                    <p class="lead team-summary" data-team-intro>${escapeHtml(data.cultureIntro)}</p>
                </div>
                <div class="product-grid" data-team-list data-empty="${escapeHtml(data.empty)}" data-error="${escapeHtml(data.error)}" aria-live="polite"></div>
            </div>
        </section>`;
}

function renderProductsPage(locale, data) {
  return `        <section class="container-xxl py-5">
            <div class="container">
                <div class="product-grid" data-products-list data-empty="${escapeHtml(data.empty)}" aria-live="polite"></div>
            </div>
        </section>`;
}

function renderPartnerships(locale, data) {
  return `        <section class="container-xxl py-5">
            <div class="container">
                <div class="row g-5">
                    <div class="col-lg-6">
                        <h2>${escapeHtml(data.modelsTitle)}</h2>
                        ${listWithChecks(data.models)}
                        <div class="notice mt-4">${escapeHtml(data.funding)}</div>
                    </div>
                    <div class="col-lg-6">
                        <h2>${escapeHtml(data.monitoringTitle)}</h2>
                        ${data.monitoring.map((item) => `<div class="timeline-step"><h3 class="h5">${escapeHtml(item.label)}</h3><p class="mb-0">${escapeHtml(item.text)}</p></div>`).join("")}
                    </div>
                </div>
            </div>
        </section>
        <section id="assessment" class="container-fluid bg-light py-5">
            <div class="container">
                ${leadForm(locale, "partnerTitle", ["organisation", "name", "email", "phone", "sector", "province", "proposedProject", "targetUsers", "stage", "timeline"])}
            </div>
        </section>`;
}

function renderImpact(locale, data) {
  const sdgs = text(locale, "pages.home.sdgs");
  return `        <section class="container-xxl py-5">
            <div class="container">
                <div class="row g-5">
                    <div class="col-lg-6">
                        <h2>${escapeHtml(data.theoryTitle)}</h2>
                        <p>${escapeHtml(data.theory)}</p>
                        <h2 class="mt-5">${escapeHtml(data.carbonTitle)}</h2>
                        <p>${escapeHtml(data.carbon)}</p>
                    </div>
                    <div class="col-lg-6">
                        <div class="info-card p-4 mb-4">
                            <h2>${escapeHtml(data.baselineTitle)}</h2>
                            ${listWithChecks(data.baseline)}
                        </div>
                        <ul class="sdg-list">
                            ${sdgs.map((sdg) => `<li>${escapeHtml(sdg)}</li>`).join("")}
                        </ul>
                    </div>
                </div>
            </div>
        </section>`;
}

function renderResources(locale, data) {
  const linkCards = [
    {
      href: localHref(locale, "faq"),
      icon: "fa-question-circle",
      title: text(locale, "pages.faq.title"),
      text: text(locale, "pages.faq.intro")
    },
    {
      href: localHref(locale, "articles"),
      icon: "fa-newspaper",
      title: text(locale, "pages.articles.title"),
      text: text(locale, "pages.articles.intro")
    }
  ];

  return `        <section class="container-xxl py-5">
            <div class="container">
                <div class="row g-5">
                    <div class="col-lg-5">
                        <div class="info-card p-4">
                            <h2>${escapeHtml(data.downloadsTitle)}</h2>
                            ${listWithChecks(data.downloads)}
                        </div>
                    </div>
                    <div class="col-lg-7">
                        <div class="row g-4">
                            ${linkCards.map((card) => `<div class="col-md-6"><a class="resource-link-card p-4" href="${escapeHtml(card.href)}"><div class="icon-box"><i class="fa ${escapeHtml(card.icon)}"></i></div><h2 class="h4">${escapeHtml(card.title)}</h2><p class="mb-0">${escapeHtml(card.text)}</p></a></div>`).join("")}
                        </div>
                    </div>
                </div>
                <div id="privacy" class="info-card p-4 mt-5">
                    <h2 data-i18n="footer.privacy">${escapeHtml(text(locale, "footer.privacy"))}</h2>
                    <p class="mb-0">${escapeHtml(text(locale, "pages.contact.privacyNotice"))}</p>
                </div>
                <div id="legal" class="info-card p-4 mt-4">
                    <h2 data-i18n="footer.legal">${escapeHtml(text(locale, "footer.legal"))}</h2>
                    <p class="mb-0">${escapeHtml(text(locale, "brand.statusNotice"))}</p>
                </div>
            </div>
        </section>`;
}

function renderFaq(locale) {
  return `        <section class="container-xxl py-5">
            <div class="container">
                <p data-faq-status role="status"
                   data-empty="${locale === "pt" ? "Ainda não há perguntas frequentes." : "There are no frequently asked questions yet."}"
                   data-error="${locale === "pt" ? "Não foi possível carregar as perguntas frequentes." : "Could not load frequently asked questions."}">${locale === "pt" ? "A carregar…" : "Loading…"}</p>
                <div class="accordion" id="faqAccordion"></div>
                <template id="faqTemplate">
                    <div class="accordion-item">
                        <h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" aria-expanded="false"></button></h2>
                        <div class="accordion-collapse collapse" data-bs-parent="#faqAccordion"><div class="accordion-body" style="white-space: pre-line"></div></div>
                    </div>
                </template>
            </div>
        </section>`;
}

function renderArticlesPage(locale, data) {
  return `        <section class="container-xxl py-5">
            <div class="container">
                <div class="article-index-list" data-articles-list data-detail-path="${escapeHtml(localHref(locale, "article"))}" data-empty="${escapeHtml(data.empty)}" aria-live="polite"></div>
            </div>
        </section>`;
}

function renderArticlePage(locale, data) {
  return `        <section class="container-xxl py-5">
            <div class="container">
                <article class="article-detail" data-article-detail data-empty="${escapeHtml(data.missing)}" data-not-found="${escapeHtml(data.notFound)}" data-back-href="${escapeHtml(localHref(locale, "articles"))}" data-back-label="${escapeHtml(data.backToArticles)}" aria-live="polite"></article>
            </div>
        </section>`;
}

function renderContact(locale, data) {
  return `        <section class="container-xxl py-5">
            <div class="container">
                <div class="row g-5">
                    <div class="col-lg-6">
                        <h2>${escapeHtml(data.locationTitle)}</h2>
                        <p data-company-map-label>Mozambique</p>
                        <iframe class="contact-location-map" data-company-map src="https://www.google.com/maps?q=Mozambique&amp;output=embed" title="${escapeHtml(data.mapTitle)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
                        <a class="d-inline-block mt-3 mb-4" data-company-map-directions href="https://www.google.com/maps/search/?api=1&amp;query=Mozambique" target="_blank" rel="noopener noreferrer">${escapeHtml(data.mapDirections)} <i class="fa fa-external-link-alt ms-1" aria-hidden="true"></i></a>
                        <h3 class="h5">${escapeHtml(text(locale, "actions.whatsapp"))}</h3>
                        <p data-company-whatsapp-notice>${escapeHtml(data.whatsappNotice)}</p>
                        <a class="btn btn-primary py-3 px-5" href="#" data-company-link="whatsapp" data-i18n="actions.whatsapp">${escapeHtml(text(locale, "actions.whatsapp"))}</a>
                        <div class="notice mt-4">${escapeHtml(data.privacyNotice)}</div>
                    </div>
                    <div class="col-lg-6">
                        ${leadForm(locale, "generalTitle", ["name", "phone", "email", "province", "district", "message"])}
                    </div>
                </div>
            </div>
        </section>
        <section id="assessment" class="container-fluid bg-light py-5">
            <div class="container">
                ${leadForm(locale, "biogasTitle", ["name", "phone", "province", "district", "siteType", "livestock", "feedstockQty", "waterAccess", "currentFuel", "intendedUsers", "stage"])}
            </div>
        </section>`;
}

function renderSolutionCard(locale, card) {
  const href = locale === "pt" && card.href === "biofertilizer.html" ? "biofertilizante.html" : card.href;
  return `<div class="col-md-6 col-lg-4">
        <article class="solution-card overflow-hidden">
            <img src="../img/${escapeHtml(card.image)}" alt="${escapeHtml(card.title)}">
            <div class="p-4">
                <div class="icon-box"><i class="fa ${escapeHtml(card.icon)}"></i></div>
                <h3 class="h4">${escapeHtml(card.title)}</h3>
                <p>${escapeHtml(card.text)}</p>
                <a class="small fw-medium" href="${escapeHtml(href)}">${escapeHtml(text(locale, "actions.readMore"))}<i class="fa fa-arrow-right ms-2"></i></a>
            </div>
        </article>
    </div>`;
}

function sectionIntro(kicker, title, intro = "") {
  return `        <section class="container-xxl py-5">
            <div class="container text-center">
                ${kicker ? `<span class="section-kicker">${escapeHtml(kicker)}</span>` : ""}
                <h2 class="mb-3">${escapeHtml(title)}</h2>
                ${intro ? `<p class="mx-auto mb-0" style="max-width: 760px;">${escapeHtml(intro)}</p>` : ""}
            </div>
        </section>`;
}

function listWithChecks(items) {
  return `<div>${items.map((item) => `<p><i class="fa fa-check-circle text-primary me-3"></i>${escapeHtml(item)}</p>`).join("")}</div>`;
}

function numberedList(items) {
  return `<ol class="mb-0">${items.map((item) => `<li class="mb-2">${escapeHtml(item)}</li>`).join("")}</ol>`;
}

function contentBlock(title, content) {
  return `<div class="col-lg-6"><div class="info-card p-4">${title ? `<h2>${escapeHtml(title)}</h2>` : ""}${content}</div></div>`;
}

function contentGrid(blocks) {
  return `        <section class="container-xxl py-5">
            <div class="container">
                <div class="row g-4">
                    ${blocks.join("")}
                </div>
            </div>
        </section>`;
}

function renderCta(locale, title, textValue) {
  return `        <section class="container-xxl py-5">
            <div class="container">
                <div class="info-card p-5 text-center">
                    <h2>${escapeHtml(title)}</h2>
                    <p class="mx-auto mb-4" style="max-width: 760px;">${escapeHtml(textValue)}</p>
                    <div class="d-flex flex-wrap gap-3 justify-content-center">
                        <a href="${localHref(locale, "contact")}#assessment" class="btn btn-primary py-3 px-5" data-i18n="actions.requestAssessment">${escapeHtml(text(locale, "actions.requestAssessment"))}</a>
                        <a href="${localHref(locale, "contact")}" class="btn btn-outline-primary py-3 px-5" data-i18n="actions.contactUs">${escapeHtml(text(locale, "actions.contactUs"))}</a>
                    </div>
                </div>
            </div>
        </section>`;
}

function leadForm(locale, titleKey, fieldKeys) {
  const title = text(locale, `forms.${titleKey}`);
  const fields = ["subject", ...fieldKeys].map((key) => {
    const label = text(locale, `forms.${key}`);
    const isMessage = key === "message" || key === "proposedProject";
    return `<div class="${isMessage ? "col-12" : "col-md-6"}">
        <label class="form-label" for="${titleKey}-${key}">${escapeHtml(label)}</label>
        ${isMessage ? `<textarea class="form-control" id="${titleKey}-${key}" name="${key}" rows="4" required></textarea>` : `<input class="form-control" id="${titleKey}-${key}" name="${key}" type="${key === "email" ? "email" : "text"}" required>`}
    </div>`;
  }).join("");

  return `<div class="form-panel p-4 p-lg-5">
        <h2>${escapeHtml(title)}</h2>
        <form data-lead-form class="needs-validation" novalidate>
            <div class="row g-3">
                ${fields}
                <div class="col-12 d-none">
                    <label for="${titleKey}-company">${escapeHtml(text(locale, "forms.honeypot"))}</label>
                    <input id="${titleKey}-company" name="company" type="text" tabindex="-1" autocomplete="off">
                </div>
                <div class="col-12">
                    <div class="form-check">
                        <input class="form-check-input" id="${titleKey}-consent" name="consent" type="checkbox" required>
                        <label class="form-check-label" for="${titleKey}-consent">${escapeHtml(text(locale, "forms.consent"))}</label>
                    </div>
                </div>
                <div class="col-12">
                    <button class="btn btn-primary py-3 px-5" type="submit" data-i18n="actions.send">${escapeHtml(text(locale, "actions.send"))}</button>
                </div>
                <div class="col-12">
                    <p class="form-response mb-0" tabindex="-1" hidden data-i18n="forms.success">${escapeHtml(text(locale, "forms.success"))}</p>
                </div>
            </div>
        </form>
    </div>`;
}

function renderRootRedirect() {
  return `<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="utf-8">
    <title>${escapeHtml(pt.brand.name)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, follow">
    <link rel="canonical" href="${absolutePageUrl("pt", "home")}">
    <link href="css/bootstrap.min.css" rel="stylesheet">
    <link href="css/style.css" rel="stylesheet">
    <script>
        (function () {
            var preferred = "pt";
            try { preferred = localStorage.getItem("preferredLocale") || "pt"; } catch (error) {}
            window.location.replace(preferred === "en" ? "en/" : "pt/");
        }());
    </script>
</head>
<body>
    <main class="redirect-page">
        <div class="container">
            <h1>${escapeHtml(pt.brand.name)}</h1>
            <p>${escapeHtml(pt.brand.tagline)}</p>
            <p><a href="pt/">Português</a> | <a href="en/">English</a></p>
        </div>
    </main>
</body>
</html>
`;
}

function writeLegacyRedirects() {
  const redirects = {
    "about.html": "pt/sobre.html",
    "service.html": "pt/solucoes.html",
    "project.html": "pt/parcerias.html",
    "quote.html": "pt/contacto.html#assessment",
    "contact.html": "pt/contacto.html",
    "feature.html": "pt/impacto.html",
    "testimonial.html": "pt/recursos.html",
    "team.html": "pt/equipa.html"
  };
  for (const [file, target] of Object.entries(redirects)) {
    writeFile(file, redirectPage(target));
  }

  writeFile("404.html", `<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="utf-8">
    <title>Página não encontrada | ${escapeHtml(pt.brand.name)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="css/bootstrap.min.css" rel="stylesheet">
    <link href="css/style.css" rel="stylesheet">
</head>
<body>
    <main class="redirect-page">
        <div class="container">
            <h1>Página não encontrada</h1>
            <p>A página solicitada não existe ou foi movida.</p>
            <a class="btn btn-primary" href="pt/">${escapeHtml(pt.actions.goHome)}</a>
        </div>
    </main>
</body>
</html>
`);
}

function redirectPage(target) {
  return `<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="utf-8">
    <title>Redireccionamento</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="0; url=${target}">
    <meta name="robots" content="noindex, follow">
    <link rel="canonical" href="${baseUrl}/${target.replace(/^\/+/, "")}">
</head>
<body>
    <p><a href="${target}">Continuar</a></p>
</body>
</html>
`;
}

function renderSitemap() {
  const urls = [];
  for (const pageKey of Object.keys(pages)) {
    for (const locale of Object.keys(locales)) {
      urls.push(`  <url>
    <loc>${absolutePageUrl(locale, pageKey)}</loc>
    <lastmod>${today}</lastmod>
    <xhtml:link rel="alternate" hreflang="pt" href="${absolutePageUrl("pt", pageKey)}" />
    <xhtml:link rel="alternate" hreflang="en" href="${absolutePageUrl("en", pageKey)}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${absolutePageUrl("pt", pageKey)}" />
  </url>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`;
}
