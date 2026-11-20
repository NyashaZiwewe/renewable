(function () {
    "use strict";

    var body = document.body;
    var activeLocale = body.getAttribute("data-locale") || "pt";
    var localeRoot = body.getAttribute("data-locale-root") || "locales";
    var cache = window.__localeCache || (window.__localeCache = {});

    function loadPartials() {
        var partials = Array.prototype.slice.call(document.querySelectorAll("[data-site-partial-src]"));
        if (!partials.length) {
            return Promise.resolve();
        }

        return Promise.all(partials.map(function (node) {
            var src = node.getAttribute("data-site-partial-src");
            return fetch(src)
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error("Partial not available: " + src);
                    }
                    return response.text();
                })
                .then(function (html) {
                    node.innerHTML = html;
                })
                .catch(function () {
                    // Shared partials are progressive enhancement for the static build.
                    // If a partial cannot load, leave the mount empty instead of blocking the page body.
                });
        }));
    }

    function getNested(source, key) {
        return key.split(".").reduce(function (value, part) {
            return value && Object.prototype.hasOwnProperty.call(value, part) ? value[part] : undefined;
        }, source);
    }

    function applyText(resources) {
        document.querySelectorAll("[data-i18n]").forEach(function (node) {
            var value = getNested(resources, node.getAttribute("data-i18n"));
            if (typeof value === "string") {
                node.textContent = value;
            }
        });

        document.querySelectorAll("[data-i18n-placeholder]").forEach(function (node) {
            var value = getNested(resources, node.getAttribute("data-i18n-placeholder"));
            if (typeof value === "string") {
                node.setAttribute("placeholder", value);
            }
        });

        document.querySelectorAll("[data-i18n-label]").forEach(function (node) {
            var value = getNested(resources, node.getAttribute("data-i18n-label"));
            if (typeof value === "string") {
                node.setAttribute("aria-label", value);
            }
        });
    }

    function loadLocale(locale) {
        if (cache[locale]) {
            return Promise.resolve(cache[locale]);
        }

        return fetch(localeRoot + "/" + locale + "/common.json")
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("Locale not available: " + locale);
                }
                return response.json();
            })
            .then(function (resources) {
                cache[locale] = resources;
                return resources;
            });
    }

    function initI18n(resources) {
        if (window.i18next) {
            window.i18next.init({
                lng: activeLocale,
                fallbackLng: false,
                resources: {}
            });
        }
        applyText(resources);
    }

    function syncSharedHeader() {
        var pageKey = body.getAttribute("data-page-key") || "home";
        var activeParent = body.getAttribute("data-active-parent") || pageKey;

        document.querySelectorAll("[data-nav-page]").forEach(function (link) {
            var key = link.getAttribute("data-nav-page");
            var isDropdownItem = link.classList.contains("dropdown-item");
            link.classList.toggle("active", isDropdownItem ? key === pageKey : key === activeParent);
        });

        document.querySelectorAll("[data-nav-parent]").forEach(function (link) {
            link.classList.toggle("active", link.getAttribute("data-nav-parent") === activeParent);
        });

        document.querySelectorAll("[data-switch-locale]").forEach(function (link) {
            var locale = link.getAttribute("data-switch-locale");
            var href = body.getAttribute("data-alt-" + locale);
            if (href) {
                link.setAttribute("href", href);
            }
            link.classList.toggle("active", locale === activeLocale);
        });
    }

    function applyCompanySettings() {
        return fetch(window.apiUrl("/api/company-settings"))
            .then(function (response) { if (!response.ok) throw new Error("Settings unavailable"); return response.json(); })
            .then(function (result) {
                var settings = result.settings || {};
                ["name", "motto", "address", "phone", "whatsapp"].forEach(function (key) {
                    var selector = '[data-company="' + key + '"]';
                    if (key === "name") selector += ',[data-i18n="brand.name"]';
                    if (key === "motto") selector += ',[data-i18n="brand.tagline"]';
                    if (settings[key]) document.querySelectorAll(selector).forEach(function (node) { node.textContent = settings[key]; });
                });
                var mapLocation = settings.mapLocation || settings.address || "Mozambique";
                document.querySelectorAll("[data-company-map]").forEach(function (map) {
                    map.src = "https://www.google.com/maps?q=" + encodeURIComponent(mapLocation) + "&output=embed";
                });
                document.querySelectorAll("[data-company-map-label]").forEach(function (label) { label.textContent = mapLocation; });
                document.querySelectorAll("[data-company-map-directions]").forEach(function (link) {
                    link.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(mapLocation);
                });
                if (settings.name) document.querySelectorAll('[data-i18n="brand.workingNameNotice"]').forEach(function (node) { node.hidden = true; });
                if (settings.whatsapp) document.querySelectorAll('[data-company-whatsapp-notice]').forEach(function (node) { node.hidden = true; });
                if (settings.logo && settings.logo !== "#") document.querySelectorAll(".brand-mark").forEach(function (node) {
                    var img = document.createElement("img");
                    img.src = window.assetUrl(settings.logo);
                    img.alt = settings.name || "Company logo";
                    img.style.cssText = "max-width:42px;max-height:42px;object-fit:contain";
                    node.replaceChildren(img);
                    node.removeAttribute("aria-hidden");
                });
                document.querySelectorAll("[data-company-link]").forEach(function (link) {
                    var key = link.getAttribute("data-company-link"), value = settings[key];
                    if (!value || value === "#") return;
                    if (key === "phone") value = "tel:" + value.replace(/[^+0-9]/g, "");
                    else if (key === "whatsapp") value = "https://wa.me/" + value.replace(/[^0-9]/g, "");
                    else if (!/^https?:\/\//i.test(value)) return;
                    link.href = value;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                });
            }).catch(function () { /* Keep generated defaults when settings are unavailable. */ });
    }

    function loadFaqs() {
        var accordion = document.getElementById("faqAccordion");
        if (!accordion) return Promise.resolve();
        var status = document.querySelector("[data-faq-status]");
        var template = document.getElementById("faqTemplate");
        return fetch(window.apiUrl("/api/faqs?locale=" + encodeURIComponent(activeLocale)))
            .then(function (response) {
                if (!response.ok) throw new Error("FAQs unavailable");
                return response.json();
            }).then(function (result) {
                result.faqs.forEach(function (faq, index) {
                    var item = template.content.firstElementChild.cloneNode(true);
                    var button = item.querySelector("button");
                    var panel = item.querySelector(".accordion-collapse");
                    button.id = "faqQuestion" + index;
                    button.textContent = faq.question;
                    panel.id = "faqPanel" + index;
                    panel.setAttribute("aria-labelledby", button.id);
                    button.setAttribute("aria-controls", panel.id);
                    button.setAttribute("data-bs-target", "#" + panel.id);
                    panel.firstElementChild.textContent = faq.answer;
                    if (index === 0) {
                        panel.classList.add("show");
                        button.classList.remove("collapsed");
                        button.setAttribute("aria-expanded", "true");
                    }
                    accordion.appendChild(item);
                });
                status.textContent = result.faqs.length ? "" : status.dataset.empty;
                status.hidden = result.faqs.length > 0;
            }).catch(function () { status.textContent = status.dataset.error; });
    }

    function loadPartners() {
        var section = document.querySelector("[data-partners-section]");
        if (!section) return Promise.resolve();
        return fetch(window.apiUrl("/api/partners"), { headers: { Accept: "application/json" } })
            .then(function (response) { if (!response.ok) throw new Error("Partners unavailable"); return response.json(); })
            .then(function (content) {
                if (!content.partners || !content.partners.length) return;
                var track = section.querySelector("[data-partner-track]");
                content.partners.forEach(function (partner) {
                    // Keep external destinations restricted even if a stored record was edited outside admin.
                    if (!/^https?:\/\//i.test(partner.websiteUrl)) return;
                    var link = document.createElement("a");
                    link.className = "partner-logo";
                    link.href = partner.websiteUrl;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    var logo = document.createElement("img");
                    logo.src = window.assetUrl(partner.logoUrl);
                    logo.alt = "";
                    logo.loading = "lazy";
                    link.appendChild(logo);
                    var name = document.createElement("span");
                    name.className = "partner-name";
                    name.textContent = partner.name;
                    link.appendChild(name);
                    track.appendChild(link);
                });
                if (!track.children.length) return;
                section.hidden = false;
                initPartnerCarousel(section, track);
            }).catch(function () { /* Leave the section hidden if partners cannot load. */ });
    }

    function initPartnerCarousel(section, track) {
        var controls = section.querySelector("[data-partner-controls]");
        var pause = section.querySelector("[data-partner-pause]");
        var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
        var paused = false, hovered = false, focused = false, timer = null;
        var pt = activeLocale === "pt";
        function overflow() { return track.scrollWidth > track.clientWidth + 2; }
        function advance(direction) {
            var maximum = track.scrollWidth - track.clientWidth;
            var next = track.scrollLeft + direction * track.clientWidth;
            if (direction > 0 && track.scrollLeft >= maximum - 2) next = 0;
            if (direction < 0 && track.scrollLeft <= 2) next = maximum;
            track.scrollTo({ left: Math.max(0, Math.min(next, maximum)), behavior: reduced.matches ? "auto" : "smooth" });
        }
        function update() {
            controls.hidden = !overflow();
            pause.hidden = reduced.matches;
            if (timer !== null) { clearInterval(timer); timer = null; }
            if (overflow() && !reduced.matches && !paused && !hovered && !focused && !document.hidden) {
                timer = setInterval(function () { advance(1); }, 4000);
            }
        }
        section.querySelector("[data-partner-prev]").addEventListener("click", function () { advance(-1); });
        section.querySelector("[data-partner-next]").addEventListener("click", function () { advance(1); });
        pause.addEventListener("click", function () {
            paused = !paused;
            pause.textContent = paused ? (pt ? "Retomar" : "Resume") : (pt ? "Pausar" : "Pause");
            update();
        });
        section.addEventListener("mouseenter", function () { hovered = true; update(); });
        section.addEventListener("mouseleave", function () { hovered = false; update(); });
        section.addEventListener("focusin", function () { focused = true; update(); });
        section.addEventListener("focusout", function (event) { focused = section.contains(event.relatedTarget); update(); });
        document.addEventListener("visibilitychange", update);
        window.addEventListener("resize", update);
        if (reduced.addEventListener) reduced.addEventListener("change", update);
        update();
    }

    loadPartials().then(function () {
        syncSharedHeader();
        return loadLocale(activeLocale);
    }).then(initI18n).catch(function () {
        syncSharedHeader();
        // Static pages and shared partials are generated with translated text. If JSON cannot load,
        // leave rendered content in place instead of exposing raw keys.
    }).then(function () { return Promise.all([applyCompanySettings(), loadPartners()]); });

    loadFaqs();

    document.addEventListener("click", function (event) {
        var switchLink = event.target.closest("[data-switch-locale]");
        if (!switchLink) {
            return;
        }

        try {
            localStorage.setItem("preferredLocale", switchLink.getAttribute("data-switch-locale"));
        } catch (error) {
            // Preference storage is optional.
        }
    });

    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        document.addEventListener("click", function (event) {
            var link = event.target.closest("a[href]");
            if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                return;
            }

            var href = link.getAttribute("href");
            if (!href || href.startsWith("#") || link.target === "_blank" || link.hasAttribute("download")) {
                return;
            }

            var nextUrl = new URL(href, window.location.href);
            var currentUrl = new URL(window.location.href);
            if (nextUrl.origin !== currentUrl.origin || nextUrl.pathname === currentUrl.pathname && nextUrl.hash) {
                return;
            }

            event.preventDefault();
            document.body.classList.add("is-leaving");
            window.setTimeout(function () {
                window.location.href = nextUrl.href;
            }, 160);
        });
    }

    document.querySelectorAll("form[data-lead-form]").forEach(function (form) {
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            if (!form.checkValidity()) {
                form.classList.add("was-validated");
                return;
            }

            var response = form.querySelector(".form-response");
            var submitButton = form.querySelector("[type='submit']");
            if (response) {
                response.hidden = false;
                response.textContent = activeLocale === "pt" ? "A enviar..." : "Sending...";
                response.classList.remove("is-error");
                response.focus();
            }

            if (submitButton) {
                submitButton.disabled = true;
            }

            fetch(window.apiUrl("leads"), {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(getLeadPayload(form))
            }).then(function (request) {
                return request.json().catch(function () {
                    return {};
                }).then(function (payload) {
                    if (!request.ok) {
                        throw new Error(payload.message || (activeLocale === "pt" ? "Não foi possível enviar o pedido." : "The request could not be sent."));
                    }
                    return payload;
                });
            }).then(function (payload) {
                if (response) {
                    response.textContent = payload.message || (activeLocale === "pt" ? "Obrigado. O seu pedido foi enviado." : "Thank you. Your request has been sent.");
                }
                form.reset();
                form.classList.remove("was-validated");
            }).catch(function (error) {
                if (response) {
                    response.hidden = false;
                    response.textContent = error.message;
                    response.classList.add("is-error");
                    response.focus();
                }
            }).finally(function () {
                if (submitButton) {
                    submitButton.disabled = false;
                }
            });
        });
    });

    function getLeadPayload(form) {
        var data = new FormData(form);
        var payload = {
            locale: activeLocale,
            pageUrl: window.location.pathname,
            formName: getFormName(form)
        };

        data.forEach(function (value, key) {
            payload[key] = String(value);
        });

        if (form.querySelector("[name='consent']")) {
            payload.consent = form.querySelector("[name='consent']").checked;
        }

        return payload;
    }

    function getFormName(form) {
        var panel = form.closest(".form-panel");
        var title = panel ? panel.querySelector("h2") : null;
        return title ? title.textContent.trim() : "";
    }
}());
