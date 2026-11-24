(function () {
    "use strict";

    var page = document.body.getAttribute("data-admin-page");
    var state = {
        csrfToken: "",
        articles: [],
        products: [],
        leads: [],
        editingId: "",
        editingProductId: "",
        editor: null
    };

    function byId(id) {
        return document.getElementById(id);
    }

    function setStatus(node, message, type) {
        if (!node) return;
        node.textContent = message || "";
        node.classList.toggle("is-error", type === "error");
        node.classList.toggle("is-success", type === "success");
    }

    function slugify(value) {
        return String(value || "")
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .replace(/-{2,}/g, "-");
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatDate(value) {
        if (!value) return "Not published";
        return new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
        }).format(new Date(value));
    }

    function api(path, options) {
        var requestOptions = options || {};
        var headers = requestOptions.headers || {};

        headers.Accept = "application/json";
        if (requestOptions.body && !headers["Content-Type"] && !(requestOptions.body instanceof FormData)) {
            headers["Content-Type"] = "application/json";
        }
        if (state.csrfToken && !/^(GET|HEAD)$/i.test(requestOptions.method || "GET")) {
            headers["X-CSRF-Token"] = state.csrfToken;
        }

        return fetch(window.apiUrl(path), Object.assign({}, requestOptions, {
            credentials: "same-origin",
            headers: headers
        })).then(function (response) {
            return response.text().then(function (raw) {
                var payload;
                try { payload = JSON.parse(raw); } catch (error) { payload = null; }
                if (!response.ok || !payload || typeof payload !== "object") {
                    var message = payload && typeof payload.message === "string" ? payload.message : "";
                    if (!message && payload && payload.error && typeof payload.error.message === "string") message = payload.error.message;
                    if (!message) {
                        message = "The server returned HTTP " + response.status + (response.statusText ? " " + response.statusText : "") + ". ";
                        message += payload ? "The request could not be completed." : "It did not return an API error message. Check the response in the browser Network tab or the hosting error log.";
                    }
                    var error = new Error(message);
                    error.status = response.status;
                    error.field = payload && typeof payload.field === "string" ? payload.field : "";
                    throw error;
                }
                return payload;
            });
        });
    }

    function formJson(form) {
        var data = new FormData(form);
        var payload = {};
        data.forEach(function (value, key) {
            if (typeof File !== "undefined" && value instanceof File) return;
            payload[key] = String(value);
        });
        return payload;
    }

    function initLogin() {
        var form = byId("loginForm");
        var status = byId("formStatus");

        form.addEventListener("submit", function (event) {
            event.preventDefault();
            setStatus(status, "Signing in...");
            api("/api/admin/login", {
                method: "POST",
                body: JSON.stringify(formJson(form))
            }).then(function () {
                window.location.href = "index.html";
            }).catch(function (error) {
                setStatus(status, error.message, "error");
            });
        });
    }

    function initForgot() {
        var form = byId("forgotForm");
        var status = byId("formStatus");

        form.addEventListener("submit", function (event) {
            event.preventDefault();
            setStatus(status, "Sending reset link...");
            api("/api/admin/request-password-reset", {
                method: "POST",
                body: JSON.stringify(formJson(form))
            }).then(function (payload) {
                setStatus(status, payload.message, "success");
                form.reset();
            }).catch(function (error) {
                setStatus(status, error.message, "error");
            });
        });
    }

    function initReset() {
        var form = byId("resetForm");
        var status = byId("formStatus");
        var token = new URLSearchParams(window.location.search).get("token") || "";

        if (!token) {
            setStatus(status, "Reset token is missing.", "error");
        }

        form.addEventListener("submit", function (event) {
            event.preventDefault();
            var payload = formJson(form);
            if (payload.newPassword !== payload.confirmPassword) {
                setStatus(status, "Passwords do not match.", "error");
                return;
            }
            setStatus(status, "Updating password...");
            api("/api/admin/reset-password", {
                method: "POST",
                body: JSON.stringify({
                    token: token,
                    newPassword: payload.newPassword
                })
            }).then(function (result) {
                setStatus(status, result.message, "success");
                form.reset();
            }).catch(function (error) {
                setStatus(status, error.message, "error");
            });
        });
    }

    function renderAdminNavigation() {
        var sections = [
            { label: "Overview", links: [
                { page: "home", href: "index.html", label: "Dashboard", icon: "grid" }
            ] },
            { label: "Account", links: [
                { page: "accounts", href: "accounts.html", label: "Add administrator", icon: "person-plus" },
                { page: "password", href: "change-password.html", label: "Change password", icon: "key" }
            ] },
            { label: "Website", links: [
                { page: "company", href: "company.html", label: "Company settings", icon: "building" },
                { page: "articles", href: "articles.html", label: "Articles", icon: "newspaper" },
                { page: "products", href: "products.html", label: "Products", icon: "box-seam" },
                { page: "team", href: "team.html", label: "Team", icon: "people" },
                { page: "partners", href: "partners.html", label: "Partner logos", icon: "diagram-3" },
                { page: "faqs", href: "faqs.html", label: "FAQs", title: "Frequently asked questions", icon: "question-circle" }
            ] },
            { label: "Inbox", links: [
                { page: "leads", href: "leads.html", label: "Queries and leads", icon: "inbox" },
                { page: "whistleblowing", href: "whistleblowing.html", label: "Whistleblowing", title: "Whistleblowing inbox", icon: "shield-exclamation" }
            ] }
        ];
        var main = document.querySelector("main");
        main.id = "adminContent";
        main.tabIndex = -1;

        var layout = document.createElement("div");
        layout.className = "admin-shell";
        layout.innerHTML = `
            <a class="visually-hidden-focusable admin-skip-link" href="#adminContent">Skip to content</a>
            <header class="admin-topbar">
                <button type="button" class="btn btn-outline-primary admin-menu-toggle"
                        aria-controls="adminSidebar" aria-expanded="false">
                    <i class="bi bi-list" aria-hidden="true"></i> Menu
                </button>
                <h1></h1>
            </header>
            <aside class="admin-sidebar" id="adminSidebar">
                <div class="admin-sidebar-brand">
                    <i class="bi bi-lightning-charge-fill" id="adminBrandIcon" aria-hidden="true"></i>
                    <img id="adminBrandLogo" alt="" hidden>
                    <span>Renewable Energy <small>Admin dashboard</small></span>
                </div>
                <nav class="admin-nav" aria-label="Admin navigation"></nav>
                <div class="admin-sidebar-footer">
                    <span id="adminEmail"></span>
                    <a href="../en/" target="_blank" rel="noopener">
                        <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i> View site
                    </a>
                    <button id="logoutButton" type="button">
                        <i class="bi bi-box-arrow-right" aria-hidden="true"></i> Log out
                    </button>
                </div>
            </aside>`;

        var nav = layout.querySelector("nav");
        var title = layout.querySelector("h1");
        sections.forEach(function (section) {
            var group = document.createElement("div");
            var heading = document.createElement("p");
            heading.textContent = section.label;
            group.appendChild(heading);
            section.links.forEach(function (item) {
                var link = document.createElement("a");
                var icon = document.createElement("i");
                icon.className = "bi bi-" + item.icon;
                icon.setAttribute("aria-hidden", "true");
                link.href = item.href;
                link.append(icon, document.createTextNode(item.label));
                if (item.page === page) {
                    link.setAttribute("aria-current", "page");
                    title.textContent = item.title || item.label;
                }
                group.appendChild(link);
            });
            nav.appendChild(group);
        });

        var toggle = layout.querySelector(".admin-menu-toggle");
        var sidebar = layout.querySelector(".admin-sidebar");
        function setMenuOpen(open) {
            toggle.setAttribute("aria-expanded", String(open));
            sidebar.classList.toggle("is-open", open);
        }
        toggle.addEventListener("click", function () {
            setMenuOpen(toggle.getAttribute("aria-expanded") === "false");
        });
        layout.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true" && toggle.offsetWidth) {
                setMenuOpen(false);
                toggle.focus();
            }
        });
        main.before(layout);
        layout.appendChild(main);
    }

    function initProtectedPage(initializer) {
        renderAdminNavigation();
        api("/api/admin/me").then(function (payload) {
            state.csrfToken = payload.csrfToken;
            showAdminLogo(payload.logo);
            if (byId("adminEmail")) {
                byId("adminEmail").textContent = payload.user.email;
            }
            bindSessionEvents();
            return initializer ? initializer() : null;
        }).catch(function () {
            window.location.href = "login.html";
        });
    }

    function showAdminLogo(url) {
        var logo = byId("adminBrandLogo");
        var icon = byId("adminBrandIcon");
        logo.hidden = true;
        icon.hidden = false;
        logo.onload = function () { logo.hidden = false; icon.hidden = true; };
        logo.onerror = function () { logo.hidden = true; icon.hidden = false; };
        logo.referrerPolicy = "no-referrer";
        if (url && url !== "#") logo.src = window.assetUrl(url);
        else logo.removeAttribute("src");
    }

    function bindSessionEvents() {
        var logoutButton = byId("logoutButton");
        if (!logoutButton) return;

        logoutButton.addEventListener("click", function () {
            api("/api/admin/logout", { method: "POST" }).finally(function () {
                window.location.href = "login.html";
            });
        });
    }

    function initAdminAccountsPage() {
        initProtectedPage(function () {
            var form = byId("adminAccountForm"), fields = byId("adminAccountFields"), status = byId("adminAccountStatus");
            fields.disabled = false;
            form.addEventListener("submit", function (event) {
                event.preventDefault();
                if (fields.disabled) return;
                var payload = formJson(form);
                if (payload.password !== payload.confirmPassword) {
                    setStatus(status, "Passwords do not match.", "error");
                    return;
                }
                delete payload.confirmPassword;
                fields.disabled = true;
                setStatus(status, "Creating administrator...");
                api("/api/admin/accounts", { method: "POST", body: JSON.stringify(payload) })
                    .then(function (result) {
                        form.reset();
                        setStatus(status, result.message, "success");
                    })
                    .catch(function (error) { setStatus(status, error.message, "error"); })
                    .finally(function () { fields.disabled = false; });
            });
        });
    }

    function initFaqsPage() {
        initProtectedPage(function () {
            var form = byId("faqForm"), fields = byId("faqFields"), locale = byId("faqLocale");
            var list = byId("faqList"), status = byId("faqStatus"), newButton = byId("newFaq");
            var dialog = byId("faqDeleteDialog"), selected = null, toDelete = null;
            var basePath = "/api/admin/faqs";

            function edit(faq) {
                selected = faq;
                byId("faqEditorHeading").textContent = faq ? "Edit FAQ" : "New FAQ";
                form.elements.question.value = faq ? faq.question : "";
                form.elements.answer.value = faq ? faq.answer : "";
            }

            function render(faqs) {
                list.replaceChildren();
                if (!faqs.length) list.textContent = "No FAQs for this language.";
                faqs.forEach(function (faq) {
                    var row = document.createElement("div");
                    row.className = "border-bottom py-3";
                    var question = document.createElement("p");
                    question.className = "fw-bold text-break mb-2";
                    question.textContent = faq.question;
                    var editButton = document.createElement("button");
                    editButton.type = "button";
                    editButton.className = "btn btn-sm btn-outline-primary me-2";
                    editButton.textContent = "Edit";
                    editButton.setAttribute("aria-label", "Edit " + faq.question);
                    editButton.addEventListener("click", function () {
                        edit(faq);
                        form.elements.question.focus();
                    });
                    var deleteButton = document.createElement("button");
                    deleteButton.type = "button";
                    deleteButton.className = "btn btn-sm btn-outline-danger";
                    deleteButton.textContent = "Delete";
                    deleteButton.setAttribute("aria-label", "Delete " + faq.question);
                    deleteButton.addEventListener("click", function () {
                        toDelete = faq;
                        byId("faqDeleteQuestion").textContent = faq.question;
                        dialog.returnValue = "";
                        dialog.showModal();
                    });
                    row.append(question, editButton, deleteButton);
                    list.appendChild(row);
                });
            }

            function request(method, id, body, message) {
                var path = basePath + (id ? "/" + encodeURIComponent(id) : "") + "?locale=" + encodeURIComponent(locale.value);
                var options = body ? { method: method, body: JSON.stringify(body) } : { method: method };
                locale.disabled = fields.disabled = newButton.disabled = list.inert = true;
                setStatus(status, method === "GET" ? "Loading FAQs…" : "Updating FAQs…");
                return api(path, options).then(function (result) {
                    render(result.faqs);
                    if (method !== "DELETE" || (selected && selected.id === id)) edit(null);
                    if (message) setStatus(status, message, "success");
                    else setStatus(status, "");
                }).catch(function (error) {
                    setStatus(status, error.message, "error");
                }).finally(function () {
                    locale.disabled = fields.disabled = newButton.disabled = list.inert = false;
                    if (method === "DELETE") newButton.focus();
                });
            }

            locale.addEventListener("change", function () {
                list.replaceChildren();
                edit(null);
                request("GET");
            });
            newButton.addEventListener("click", function () {
                edit(null);
                form.elements.question.focus();
            });
            form.addEventListener("submit", function (event) {
                event.preventDefault();
                if (fields.disabled) return;
                request(selected ? "PUT" : "POST", selected && selected.id, formJson(form), "FAQ saved.");
            });
            dialog.addEventListener("close", function () {
                var faq = toDelete;
                toDelete = null;
                if (dialog.returnValue === "delete" && faq) request("DELETE", faq.id, null, "FAQ deleted.");
            });
            return request("GET");
        });
    }

    function initPartnersPage() {
        initProtectedPage(function () {
            var partners = [], busy = false, form = byId("partnerForm"), status = byId("partnerAdminStatus");
            function lock(value) {
                busy = value;
                document.querySelectorAll("main button, main input").forEach(function (node) { node.disabled = value; });
            }
            function reset() {
                form.reset(); byId("partnerId").value = "";
                byId("partnerEditorHeading").textContent = "New partner";
                byId("deletePartner").hidden = true;
            }
            function render() {
                var list = byId("partnersList"); list.replaceChildren();
                if (!partners.length) list.textContent = "No partners yet.";
                partners.forEach(function (partner, index) {
                    var row = document.createElement("div"); row.className = "border-bottom py-3";
                    var logo = document.createElement("img");
                    logo.src = window.assetUrl(partner.logoUrl); logo.alt = partner.name;
                    logo.style.cssText = "width:100px;height:60px;object-fit:contain;display:block;margin-bottom:12px";
                    var name = document.createElement("p"); name.textContent = partner.name;
                    var edit = document.createElement("button"); edit.type = "button";
                    edit.className = "btn btn-outline-primary btn-sm me-2"; edit.textContent = "Edit";
                    edit.addEventListener("click", function () {
                        if (busy) return;
                        byId("partnerId").value = partner.id;
                        form.elements.name.value = partner.name; form.elements.logoUrl.value = partner.logoUrl;
                        form.elements.websiteUrl.value = partner.websiteUrl; byId("partnerFile").value = "";
                        byId("partnerEditorHeading").textContent = "Edit partner"; byId("deletePartner").hidden = false;
                        byId("partnerName").focus();
                    });
                    row.append(logo, name, edit);
                    [-1, 1].forEach(function (direction) {
                        var move = document.createElement("button"); move.type = "button";
                        move.className = "btn btn-outline-secondary btn-sm me-2"; move.textContent = direction < 0 ? "Move up" : "Move down";
                        move.setAttribute("aria-label", move.textContent + ": " + partner.name);
                        move.disabled = index + direction < 0 || index + direction >= partners.length;
                        move.addEventListener("click", function () {
                            if (busy) return;
                            var next = partners.slice(), other = index + direction;
                            next[index] = next[other]; next[other] = partner;
                            save(next, "Partner order saved.");
                        });
                        row.appendChild(move);
                    });
                    list.appendChild(row);
                });
            }
            function save(next, message, after) {
                lock(true); setStatus(status, "Saving...");
                return api("/api/admin/partners", {method: "PUT", body: JSON.stringify({partners: next})})
                    .then(function (result) { partners = result.partners; if (after) after(); setStatus(status, message, "success"); })
                    .catch(function (error) { setStatus(status, error.message, "error"); })
                    .finally(function () { lock(false); render(); });
            }
            byId("newPartner").addEventListener("click", reset);
            form.addEventListener("submit", function (event) {
                event.preventDefault(); if (busy) return;
                var partner = formJson(form), found = false;
                partner.id = byId("partnerId").value || "partner-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
                var next = partners.map(function (old) { if (old.id !== partner.id) return old; found = true; return partner; });
                if (!found) next.push(partner);
                save(next, "Partner saved.", reset);
            });
            byId("deletePartner").addEventListener("click", function () {
                if (busy || !window.confirm("Delete this partner?")) return;
                var id = byId("partnerId").value;
                save(partners.filter(function (partner) { return partner.id !== id; }), "Partner deleted.", reset);
            });
            byId("uploadPartnerLogo").addEventListener("click", function () {
                if (busy) return;
                var file = byId("partnerFile").files[0];
                if (!file) { setStatus(status, "Choose a logo first.", "error"); return; }
                lock(true); setStatus(status, "Uploading logo...");
                uploadImage(file).then(function (result) { form.elements.logoUrl.value = result.url; setStatus(status, "Logo uploaded. Save the partner to apply it."); })
                    .catch(function (error) { setStatus(status, error.message, "error"); })
                    .finally(function () { lock(false); render(); });
            });
            lock(true);
            return api("/api/admin/partners").then(function (result) { partners = result.partners; lock(false); render(); })
                .catch(function (error) { setStatus(status, error.message + " Reload this page to try again.", "error"); });
        });
    }

    function initTeamPage() {
        initProtectedPage(function () {
            var content = { intro: "", members: [] }, loadedLocale = "en", busy = false;
            var status = byId("teamAdminStatus"), locale = byId("teamLocale");
            var form = byId("teamMemberForm"), intro = byId("teamIntro");
            function lock(value) {
                busy = value;
                document.querySelectorAll("main button, main input, main textarea, main select").forEach(function (node) { node.disabled = value; });
            }
            function reset() {
                form.reset();
                renderImagePreview("", "teamPortraitPreview");
                byId("teamMemberId").value = "";
                byId("teamEditorHeading").textContent = "New team member";
                byId("deleteTeamMember").hidden = true;
            }
            function render() {
                var list = byId("teamMembersList");
                list.replaceChildren();
                if (!content.members.length) list.textContent = "No team members yet.";
                content.members.forEach(function (member, index) {
                    var row = document.createElement("div");
                    row.className = "border-bottom py-3";
                    var name = document.createElement("strong");
                    name.textContent = member.name;
                    var details = document.createElement("p");
                    details.textContent = member.title + " · " + member.status;
                    var edit = document.createElement("button");
                    edit.type = "button";
                    edit.className = "btn btn-outline-primary btn-sm me-2";
                    edit.textContent = "Edit";
                    edit.addEventListener("click", function () {
                        if (busy) return;
                        byId("teamMemberId").value = member.id;
                        form.elements.name.value = member.name;
                        form.elements.title.value = member.title;
                        form.elements.summary.value = member.summary;
                        form.elements.imageUrl.value = member.imageUrl;
                        renderImagePreview(member.imageUrl, "teamPortraitPreview");
                        form.elements.status.value = member.status;
                        byId("teamMemberFile").value = "";
                        byId("teamEditorHeading").textContent = "Edit team member";
                        byId("deleteTeamMember").hidden = false;
                        byId("teamMemberName").focus();
                    });
                    row.append(name, details, edit);
                    [-1, 1].forEach(function (direction) {
                        var move = document.createElement("button");
                        move.type = "button";
                        move.className = "btn btn-outline-secondary btn-sm me-2";
                        move.textContent = direction < 0 ? "Move up" : "Move down";
                        move.setAttribute("aria-label", move.textContent + ": " + member.name);
                        move.disabled = index + direction < 0 || index + direction >= content.members.length;
                        move.addEventListener("click", function () {
                            if (busy) return;
                            var members = content.members.slice(), other = index + direction;
                            members[index] = members[other]; members[other] = member;
                            save({ intro: content.intro, members: members }, "Team order saved.");
                        });
                        row.appendChild(move);
                    });
                    list.appendChild(row);
                });
            }
            function load() {
                var loaded = false;
                lock(true);
                setStatus(status, "Loading team...");
                return api("/api/admin/team?locale=" + locale.value).then(function (result) {
                    content = result;
                    loaded = true;
                    loadedLocale = locale.value;
                    intro.value = content.intro;
                    reset();
                    setStatus(status, "");
                }).catch(function (error) {
                    locale.value = loadedLocale;
                    setStatus(status, error.message, "error");
                }).finally(function () {
                    lock(false); render();
                    if (!loaded) { lock(true); locale.disabled = false; }
                });
            }
            function save(next, message, after) {
                lock(true);
                setStatus(status, "Saving...");
                return api("/api/admin/team?locale=" + loadedLocale, { method: "PUT", body: JSON.stringify(next) })
                    .then(function (result) {
                        content = result;
                        setStatus(status, message, "success");
                        if (after) after();
                    }).catch(function (error) { setStatus(status, error.message, "error"); })
                    .finally(function () { lock(false); render(); });
            }
            locale.addEventListener("change", function () {
                if (!window.confirm("Switch language? Unsaved edits will be cleared.")) { locale.value = loadedLocale; return; }
                load();
            });
            byId("teamIntroForm").addEventListener("submit", function (event) {
                event.preventDefault();
                if (!busy) save({ intro: intro.value, members: content.members }, "Team introduction saved.");
            });
            byId("newTeamMember").addEventListener("click", reset);
            form.elements.imageUrl.addEventListener("change", function () {
                renderImagePreview(form.elements.imageUrl.value, "teamPortraitPreview");
            });
            form.addEventListener("submit", function (event) {
                event.preventDefault();
                if (busy) return;
                var member = formJson(form);
                member.id = byId("teamMemberId").value || "member-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
                var found = false;
                var members = content.members.map(function (old) { if (old.id !== member.id) return old; found = true; return member; });
                if (!found) members.push(member);
                save({ intro: content.intro, members: members }, "Team member saved.", reset);
            });
            byId("deleteTeamMember").addEventListener("click", function () {
                if (busy || !window.confirm("Delete this team member?")) return;
                var id = byId("teamMemberId").value;
                save({ intro: content.intro, members: content.members.filter(function (member) { return member.id !== id; }) }, "Team member deleted.", reset);
            });
            byId("uploadTeamPortrait").addEventListener("click", function () {
                var file = byId("teamMemberFile").files[0];
                if (busy) return;
                if (!file) { setStatus(status, "Choose a portrait first.", "error"); return; }
                lock(true);
                setStatus(status, "Uploading portrait...");
                uploadImage(file).then(function (result) {
                    form.elements.imageUrl.value = result.url;
                    renderImagePreview(result.url, "teamPortraitPreview");
                    setStatus(status, "Portrait uploaded. Save the member to apply it.");
                }).catch(function (error) { setStatus(status, error.message, "error"); })
                    .finally(function () { lock(false); render(); });
            });
            return load();
        });
    }

    function initCompanyPage() {
        initProtectedPage(function () {
            var form = byId("companyForm"), status = byId("companyStatus");
            var uploadButton = byId("uploadCompanyLogo"), saveButton = form.querySelector('[type="submit"]');
            var logoFile = byId("companyLogoFile");
            var savedLogo;
            function lock(locked) {
                uploadButton.disabled = saveButton.disabled = locked;
                logoFile.disabled = locked;
                form.elements.logo.disabled = locked;
            }
            lock(true);
            function showCompanyError(error) {
                setStatus(status, error.message || "Could not reach the server. Check your connection and try again.", "error");
                status.setAttribute("role", "alert");
                status.focus();
                status.scrollIntoView({ block: "center", behavior: "auto" });
                var input = error.field && form.elements.namedItem(error.field);
                if (input) {
                    input.setAttribute("aria-invalid", "true");
                    input.classList.add("is-invalid");
                }
            }
            function uploadLogo(file) {
                setStatus(status, "Uploading logo...");
                return uploadImage(file).then(function (result) {
                    form.elements.logo.value = result.url;
                    logoFile.value = "";
                    renderImagePreview(result.url, "companyLogoPreview");
                    return result.url;
                });
            }
            form.elements.logo.addEventListener("change", function () {
                renderImagePreview(form.elements.logo.value, "companyLogoPreview");
            });
            uploadButton.addEventListener("click", function () {
                var file = logoFile.files[0];
                if (!file) { setStatus(status, "Choose a logo image first.", "error"); return; }
                lock(true);
                uploadLogo(file).then(function () {
                    setStatus(status, "Logo uploaded. Save company settings to apply it.");
                }).catch(showCompanyError).finally(function () { lock(false); });
            });
            form.addEventListener("submit", function (event) {
                event.preventDefault();
                if (saveButton.disabled) return;
                var settings = formJson(form);
                var file = logoFile.files[0];
                lock(true);
                form.querySelectorAll('[aria-invalid="true"]').forEach(function (input) {
                    input.removeAttribute("aria-invalid");
                    input.classList.remove("is-invalid");
                });
                status.setAttribute("role", "status");
                var logoReady = file ? uploadLogo(file) : Promise.resolve(settings.logo);
                logoReady.then(function (url) {
                    if (url === savedLogo) delete settings.logo;
                    else settings.logo = url;
                    setStatus(status, "Saving...");
                    return api("/api/admin/company-settings", {method: "PUT", body: JSON.stringify(settings)});
                })
                    .then(function (result) {
                        savedLogo = result.settings.logo;
                        form.elements.logo.value = savedLogo;
                        renderImagePreview(savedLogo, "companyLogoPreview");
                        showAdminLogo(savedLogo);
                        setStatus(status, "Company settings saved.", "success");
                    })
                    .catch(showCompanyError)
                    .finally(function () { lock(false); });
            });
            return api("/api/admin/company-settings").then(function (result) {
                Object.keys(result.settings).forEach(function (key) { if (form.elements[key]) form.elements[key].value = result.settings[key]; });
                savedLogo = form.elements.logo.value;
                renderImagePreview(savedLogo, "companyLogoPreview");
                showAdminLogo(savedLogo);
                lock(false);
            }).catch(showCompanyError);
        });
    }

    function initAdminHome() {
        initProtectedPage();
    }

    function initArticlesPage() {
        initProtectedPage(function () {
            return loadArticleEditor().then(function () {
                bindArticleEvents();
                return loadArticles();
            });
        });
    }

    function loadArticleEditor() {
        if (window.ClassicEditor) return initRichEditor();

        return new Promise(function (resolve) {
            var script = document.createElement("script");
            script.src = "https://cdn.ckeditor.com/ckeditor5/41.4.2/classic/ckeditor.js";
            script.addEventListener("load", resolve);
            script.addEventListener("error", resolve);
            document.head.appendChild(script);
        }).then(initRichEditor);
    }

    function initProductsPage() {
        initProtectedPage(function () {
            bindProductEvents();
            return loadProducts();
        });
    }

    function initLeadsPage() {
        initProtectedPage(function () {
            byId("leadSettingsForm").addEventListener("submit", saveLeadSettings);
            byId("refreshLeadsButton").addEventListener("click", loadLeads);
            return Promise.all([loadLeads(), loadLeadSettings()]);
        });
    }

    function initPasswordPage() {
        initProtectedPage(function () {
            byId("changePasswordForm").addEventListener("submit", changePassword);
        });
    }

    function bindArticleEvents() {
        var title = byId("title");
        var slug = byId("slug");

        title.addEventListener("input", function () {
            if (!state.editingId || !slug.value) {
                slug.value = slugify(title.value);
            }
        });

        byId("articleForm").addEventListener("submit", saveArticle);
        byId("newArticleButton").addEventListener("click", resetArticleForm);
        byId("refreshButton").addEventListener("click", loadArticles);
        byId("deleteArticleButton").addEventListener("click", deleteCurrentArticle);
        byId("coverImageFile").addEventListener("change", uploadCoverImage);
        byId("imageUrl").addEventListener("input", function () {
            renderImagePreview(byId("imageUrl").value);
        });
    }

    function bindProductEvents() {
        byId("productForm").addEventListener("submit", saveProduct);
        byId("addProductPropertyButton").addEventListener("click", function () {
            addProductPropertyRow();
        });
        byId("newProductButton").addEventListener("click", resetProductForm);
        byId("refreshProductsButton").addEventListener("click", loadProducts);
        byId("deleteProductButton").addEventListener("click", deleteCurrentProduct);
        byId("productImageFile").addEventListener("change", uploadProductImage);
        byId("productImageUrl").addEventListener("input", function () {
            renderImagePreview(byId("productImageUrl").value, "productImagePreview");
        });
    }

    function initRichEditor() {
        if (!window.ClassicEditor) {
            return Promise.resolve();
        }

        return window.ClassicEditor.create(byId("content"), {
            extraPlugins: [articleUploadAdapterPlugin],
            toolbar: [
                "heading", "|",
                "bold", "italic", "link", "bulletedList", "numberedList", "|",
                "blockQuote", "insertTable", "imageUpload", "|",
                "undo", "redo"
            ],
            image: {
                toolbar: ["imageTextAlternative", "imageStyle:inline", "imageStyle:block", "imageStyle:side"]
            },
            table: {
                contentToolbar: ["tableColumn", "tableRow", "mergeTableCells"]
            },
            link: {
                addTargetToExternalLinks: true
            }
        }).then(function (editor) {
            state.editor = editor;
        }).catch(function () {
            state.editor = null;
        });
    }

    function articleUploadAdapterPlugin(editor) {
        editor.plugins.get("FileRepository").createUploadAdapter = function (loader) {
            return new ArticleUploadAdapter(loader);
        };
    }

    function ArticleUploadAdapter(loader) {
        this.loader = loader;
    }

    ArticleUploadAdapter.prototype.upload = function () {
        return this.loader.file.then(function (file) {
            return uploadImage(file).then(function (payload) {
                return { default: window.assetUrl(payload.url) };
            });
        });
    };

    ArticleUploadAdapter.prototype.abort = function () {};

    function uploadImage(file) {
        var formData = new FormData();
        formData.append("upload", file);

        return api("/api/admin/uploads", {
            method: "POST",
            body: formData
        }).then(function (payload) {
            if (!payload.url) {
                throw new Error(payload.message || "Image upload failed.");
            }
            return payload;
        });
    }

    function uploadCoverImage(event) {
        var file = event.target.files && event.target.files[0];
        var status = byId("articleStatus");
        if (!file) return;

        setStatus(status, "Uploading picture...");
        uploadImage(file).then(function (payload) {
            byId("imageUrl").value = payload.url;
            renderImagePreview(payload.url);
            setStatus(status, "Picture uploaded.", "success");
        }).catch(function (error) {
            setStatus(status, error.message, "error");
        });
    }

    function uploadProductImage(event) {
        var file = event.target.files && event.target.files[0];
        var status = byId("productStatusMessage");
        if (!file) return;

        setStatus(status, "Uploading image...");
        uploadImage(file).then(function (payload) {
            byId("productImageUrl").value = payload.url;
            renderImagePreview(payload.url, "productImagePreview");
            setStatus(status, "Image uploaded.", "success");
        }).catch(function (error) {
            setStatus(status, error.message, "error");
        });
    }

    function renderImagePreview(url, previewId) {
        url = String(url || "").trim();
        var preview = byId(previewId || "imagePreview");
        if (!preview) return;
        preview.innerHTML = "";
        preview.classList.toggle("has-image", Boolean(url && url !== "#"));
        if (!url || url === "#") return;

        var image = document.createElement("img");
        image.alt = "";
        image.referrerPolicy = "no-referrer";

        var label = document.createElement("span");
        label.textContent = url;
        image.addEventListener("error", function () {
            image.hidden = true;
            label.textContent = "Image unavailable. Check that the URL opens the image directly.";
        });
        image.src = window.assetUrl(url);

        preview.appendChild(image);
        preview.appendChild(label);
    }

    function loadArticles() {
        var list = byId("articlesList");
        list.textContent = "Loading articles...";
        return api("/api/admin/articles").then(function (payload) {
            state.articles = payload.articles || [];
            renderArticles();
        }).catch(function (error) {
            list.textContent = error.message;
        });
    }

    function renderArticles() {
        var list = byId("articlesList");
        list.innerHTML = "";

        if (!state.articles.length) {
            list.textContent = "No articles yet.";
            return;
        }

        state.articles.forEach(function (article) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "article-item";
            button.innerHTML = [
                "<span class=\"status-badge " + escapeHtml(article.status) + "\">" + escapeHtml(article.status) + "</span>",
                "<h3>" + escapeHtml(article.title) + "</h3>",
                "<div class=\"article-meta\"><span>" + escapeHtml(article.locale.toUpperCase()) + "</span><span>" + escapeHtml(formatDate(article.publishedAt || article.updatedAt)) + "</span><span>/" + escapeHtml(article.slug) + "</span></div>"
            ].join("");
            button.addEventListener("click", function () {
                editArticle(article.id);
            });
            list.appendChild(button);
        });
    }

    function loadProducts() {
        var list = byId("productsList");
        list.textContent = "Loading products...";
        return api("/api/admin/products").then(function (payload) {
            state.products = payload.products || [];
            renderProducts();
        }).catch(function (error) {
            list.textContent = error.message;
        });
    }

    function loadLeads() {
        var list = byId("leadsList");
        list.textContent = "Loading queries...";
        return api("/api/admin/leads").then(function (payload) {
            state.leads = payload.leads || [];
            renderLeads();
        }).catch(function (error) {
            list.textContent = error.message;
        });
    }

    function renderLeads() {
        var list = byId("leadsList");
        list.innerHTML = "";
        if (!state.leads.length) {
            list.textContent = "No queries have been submitted yet.";
            return;
        }

        state.leads.forEach(function (lead) {
            var card = document.createElement("article");
            card.className = "lead-item";
            var title = document.createElement("h3");
            title.className = "lead-item-subject";
            title.textContent = lead.subject || lead.formName || "Website query";
            var submitted = document.createElement("time");
            submitted.textContent = formatDate(lead.createdAt);

            var summary = document.createElement("div");
            summary.className = "lead-item-summary";
            summary.appendChild(title);

            var controls = document.createElement("div");
            controls.className = "lead-item-controls";
            var status = document.createElement("select");
            status.className = "lead-status-select";
            status.setAttribute("aria-label", "Query status");
            [["new", "New"], ["in_progress", "In progress"], ["resolved", "Resolved"]].forEach(function (item) {
                var option = document.createElement("option");
                option.value = item[0];
                option.textContent = item[1];
                status.appendChild(option);
            });
            status.value = lead.status || "new";
            var statusMessage = document.createElement("span");
            statusMessage.className = "lead-status-message";
            status.addEventListener("change", function () {
                var oldStatus = lead.status || "new";
                var nextStatus = status.value;
                status.disabled = true;
                statusMessage.textContent = "Saving...";
                api("/api/admin/leads/" + encodeURIComponent(lead.id), {
                    method: "PUT",
                    body: JSON.stringify({ status: nextStatus })
                }).then(function (result) {
                    lead.status = result.lead.status;
                    statusMessage.textContent = "Saved";
                }).catch(function (error) {
                    status.value = oldStatus;
                    statusMessage.textContent = error.message;
                }).finally(function () {
                    status.disabled = false;
                });
            });

            var viewMore = document.createElement("button");
            viewMore.type = "button";
            viewMore.className = "btn btn-outline-primary btn-sm";
            viewMore.textContent = "View more";

            var details = document.createElement("div");
            details.className = "lead-full-details";
            details.hidden = true;
            viewMore.setAttribute("aria-expanded", "false");
            viewMore.addEventListener("click", function () {
                details.hidden = !details.hidden;
                viewMore.setAttribute("aria-expanded", String(!details.hidden));
                viewMore.textContent = details.hidden ? "View more" : "Hide details";
            });

            controls.appendChild(status);
            controls.appendChild(statusMessage);
            controls.appendChild(viewMore);
            summary.appendChild(controls);
            card.appendChild(summary);

            var meta = document.createElement("div");
            meta.className = "article-meta lead-item-meta";
            appendLeadDetail(meta, "Submitted", submitted.textContent);
            appendLeadDetail(meta, "Form", lead.formName);
            appendLeadDetail(meta, "Language", (lead.locale || "en").toUpperCase());
            appendLeadDetail(meta, "Page", lead.pageUrl);
            details.appendChild(meta);

            var contact = document.createElement("div");
            contact.className = "lead-contact-details";
            appendLeadDetail(contact, "Name", lead.name);
            appendLeadDetail(contact, "Email", lead.email);
            appendLeadDetail(contact, "Phone", lead.phone);
            appendLeadDetail(contact, "Province", lead.province);
            appendLeadDetail(contact, "District", lead.district);
            details.appendChild(contact);

            var excludedFields = new Set(["name", "email", "phone", "province", "district", "locale", "formName", "subject", "pageUrl", "consent", "company"]);
            var fields = Object.entries(lead.payload || {}).filter(function (entry) {
                return !excludedFields.has(entry[0]) && entry[1] !== "" && entry[1] != null;
            });
            if (fields.length) {
                var fieldList = document.createElement("dl");
                fieldList.className = "lead-submitted-fields";
                fields.forEach(function (entry) {
                    var label = document.createElement("dt");
                    label.textContent = entry[0].replace(/([A-Z])/g, " $1").replace(/[_-]+/g, " ").trim();
                    var value = document.createElement("dd");
                    value.textContent = typeof entry[1] === "string" ? entry[1] : JSON.stringify(entry[1]);
                    fieldList.appendChild(label);
                    fieldList.appendChild(value);
                });
                details.appendChild(fieldList);
            }

            var consent = document.createElement("p");
            consent.className = "lead-consent";
            consent.textContent = lead.consent ? "Consent received" : "Consent not recorded";
            details.appendChild(consent);
            card.appendChild(details);
            list.appendChild(card);
        });
    }

    function appendLeadDetail(container, label, value) {
        if (!value) return;
        var item = document.createElement("p");
        var strong = document.createElement("strong");
        strong.textContent = label + ": ";
        item.appendChild(strong);
        item.appendChild(document.createTextNode(value));
        container.appendChild(item);
    }

    function loadLeadSettings() {
        var status = byId("leadSettingsStatus");
        return api("/api/admin/lead-settings").then(function (payload) {
            byId("leadNotificationEmail").value = payload.notificationEmail || "";
            setStatus(status, "");
        }).catch(function (error) {
            setStatus(status, error.message, "error");
        });
    }

    function saveLeadSettings(event) {
        event.preventDefault();
        var status = byId("leadSettingsStatus");
        var notificationEmail = byId("leadNotificationEmail").value.trim();
        if (notificationEmail && !byId("leadNotificationEmail").checkValidity()) {
            setStatus(status, "Enter a valid email address.", "error");
            return;
        }
        setStatus(status, "Saving notification email...");
        api("/api/admin/lead-settings", {
            method: "PUT",
            body: JSON.stringify({ notificationEmail: notificationEmail })
        }).then(function () {
            setStatus(status, "Notification email saved.", "success");
        }).catch(function (error) {
            setStatus(status, error.message, "error");
        });
    }

    function renderProducts() {
        var list = byId("productsList");
        list.innerHTML = "";

        if (!state.products.length) {
            list.textContent = "No products yet.";
            return;
        }

        state.products.forEach(function (product) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "article-item";
            button.innerHTML = [
                "<span class=\"status-badge " + escapeHtml(product.status) + "\">" + escapeHtml(product.status) + "</span>",
                "<h3>" + escapeHtml(product.name) + "</h3>",
                "<div class=\"article-meta\"><span>" + escapeHtml(product.locale.toUpperCase()) + "</span><span>" + escapeHtml(formatAvailability(product.availability)) + "</span><span>" + escapeHtml(formatMoney(product.price, product.currency)) + "</span></div>"
            ].join("");
            button.addEventListener("click", function () {
                editProduct(product.id);
            });
            list.appendChild(button);
        });
    }

    function saveArticle(event) {
        event.preventDefault();
        var form = byId("articleForm");
        var status = byId("articleStatus");
        if (state.editor) {
            byId("content").value = state.editor.getData();
        }
        var payload = formJson(form);
        var id = payload.articleId;
        var method = id ? "PUT" : "POST";
        var path = id ? "/api/admin/articles/" + encodeURIComponent(id) : "/api/admin/articles";

        setStatus(status, "Saving article...");
        api(path, {
            method: method,
            body: JSON.stringify(payload)
        }).then(function (result) {
            setStatus(status, "Article saved.", "success");
            state.editingId = result.article.id;
            byId("articleId").value = result.article.id;
            byId("editor-title").textContent = "Edit article";
            byId("deleteArticleButton").hidden = false;
            byId("imageUrl").value = result.article.imageUrl || "";
            renderImagePreview(result.article.imageUrl || "");
            if (state.editor) {
                state.editor.setData(result.article.content || "");
            }
            return loadArticles();
        }).catch(function (error) {
            setStatus(status, error.message, "error");
        });
    }

    function saveProduct(event) {
        event.preventDefault();
        var form = byId("productForm");
        var status = byId("productStatusMessage");
        var payload = formJson(form);
        payload.properties = collectProductProperties();
        var id = payload.productId;
        var method = id ? "PUT" : "POST";
        var path = id ? "/api/admin/products/" + encodeURIComponent(id) : "/api/admin/products";

        setStatus(status, "Saving product...");
        api(path, {
            method: method,
            body: JSON.stringify(payload)
        }).then(function (result) {
            setStatus(status, "Product saved.", "success");
            state.editingProductId = result.product.id;
            byId("productId").value = result.product.id;
            byId("product-editor-title").textContent = "Edit product";
            byId("deleteProductButton").hidden = false;
            byId("productImageUrl").value = result.product.imageUrl || "";
            renderImagePreview(result.product.imageUrl || "", "productImagePreview");
            return loadProducts();
        }).catch(function (error) {
            setStatus(status, error.message, "error");
        });
    }

    function editArticle(id) {
        var article = state.articles.find(function (item) {
            return item.id === id;
        });
        if (!article) return;

        state.editingId = article.id;
        byId("editor-title").textContent = "Edit article";
        byId("articleId").value = article.id;
        byId("locale").value = article.locale;
        byId("status").value = article.status;
        byId("title").value = article.title;
        byId("slug").value = article.slug;
        byId("summary").value = article.summary || "";
        byId("imageUrl").value = article.imageUrl || "";
        renderImagePreview(article.imageUrl || "");
        if (state.editor) {
            state.editor.setData(article.content || "");
        } else {
            byId("content").value = article.content || "";
        }
        byId("deleteArticleButton").hidden = false;
        setStatus(byId("articleStatus"), "");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function editProduct(id) {
        var product = state.products.find(function (item) {
            return item.id === id;
        });
        if (!product) return;

        state.editingProductId = product.id;
        byId("product-editor-title").textContent = "Edit product";
        byId("productId").value = product.id;
        byId("productLocale").value = product.locale;
        byId("productStatus").value = product.status;
        byId("productName").value = product.name;
        byId("productDescription").value = product.description || "";
        byId("productAvailability").value = product.availability || "available";
        byId("productCurrency").value = product.currency || "MZN";
        renderProductProperties(product.properties || []);
        byId("productPrice").value = product.price == null ? "" : product.price;
        byId("productOldPrice").value = product.oldPrice == null ? "" : product.oldPrice;
        byId("productImageUrl").value = product.imageUrl || "";
        renderImagePreview(product.imageUrl || "", "productImagePreview");
        byId("deleteProductButton").hidden = false;
        setStatus(byId("productStatusMessage"), "");
        byId("productForm").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function renderProductProperties(properties) {
        var rows = byId("productProperties");
        rows.innerHTML = "";
        (Array.isArray(properties) ? properties : []).slice(0, 5).forEach(function (property) {
            addProductPropertyRow(property);
        });
        updateProductPropertyButton();
    }

    function addProductPropertyRow(property) {
        var rows = byId("productProperties");
        if (rows.children.length >= 5) return;

        property = property || {};
        var row = document.createElement("div");
        row.className = "product-property-row";

        var key = document.createElement("input");
        key.type = "text";
        key.maxLength = 80;
        key.placeholder = "Property (e.g. Size)";
        key.setAttribute("aria-label", "Property name");
        key.setAttribute("data-product-property-key", "");
        key.value = property.key || "";

        var value = document.createElement("input");
        value.type = "text";
        value.maxLength = 200;
        value.placeholder = "Value (e.g. 10 L)";
        value.setAttribute("aria-label", "Property value");
        value.setAttribute("data-product-property-value", "");
        value.value = property.value || "";

        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn btn-outline-danger btn-sm";
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", "Remove property");
        remove.addEventListener("click", function () {
            row.remove();
            updateProductPropertyButton();
        });

        row.appendChild(key);
        row.appendChild(value);
        row.appendChild(remove);
        rows.appendChild(row);
        updateProductPropertyButton();
    }

    function collectProductProperties() {
        return Array.prototype.map.call(byId("productProperties").children, function (row) {
            return {
                key: row.querySelector("[data-product-property-key]").value,
                value: row.querySelector("[data-product-property-value]").value
            };
        });
    }

    function updateProductPropertyButton() {
        byId("addProductPropertyButton").disabled = byId("productProperties").children.length >= 5;
    }

    function resetArticleForm() {
        state.editingId = "";
        byId("articleForm").reset();
        byId("articleId").value = "";
        byId("editor-title").textContent = "New article";
        byId("deleteArticleButton").hidden = true;
        byId("coverImageFile").value = "";
        renderImagePreview("");
        if (state.editor) {
            state.editor.setData("");
        }
        setStatus(byId("articleStatus"), "");
    }

    function resetProductForm() {
        state.editingProductId = "";
        byId("productForm").reset();
        byId("productId").value = "";
        byId("productCurrency").value = "MZN";
        renderProductProperties([]);
        byId("product-editor-title").textContent = "New product";
        byId("deleteProductButton").hidden = true;
        byId("productImageFile").value = "";
        renderImagePreview("", "productImagePreview");
        setStatus(byId("productStatusMessage"), "");
    }

    function deleteCurrentArticle() {
        var id = byId("articleId").value;
        if (!id || !window.confirm("Delete this article?")) return;

        var status = byId("articleStatus");
        setStatus(status, "Deleting article...");
        api("/api/admin/articles/" + encodeURIComponent(id), {
            method: "DELETE"
        }).then(function () {
            resetArticleForm();
            setStatus(status, "Article deleted.", "success");
            return loadArticles();
        }).catch(function (error) {
            setStatus(status, error.message, "error");
        });
    }

    function deleteCurrentProduct() {
        var id = byId("productId").value;
        if (!id || !window.confirm("Delete this product?")) return;

        var status = byId("productStatusMessage");
        setStatus(status, "Deleting product...");
        api("/api/admin/products/" + encodeURIComponent(id), {
            method: "DELETE"
        }).then(function () {
            resetProductForm();
            setStatus(status, "Product deleted.", "success");
            return loadProducts();
        }).catch(function (error) {
            setStatus(status, error.message, "error");
        });
    }

    function formatAvailability(value) {
        var labels = {
            available: "Available",
            limited: "Limited",
            out_of_stock: "Out of stock",
            coming_soon: "Coming soon"
        };
        return labels[value] || "Available";
    }

    function formatMoney(value, currency) {
        var amount = Number(value || 0);
        return (currency || "MZN") + " " + amount.toLocaleString(undefined, {
            minimumFractionDigits: amount % 1 ? 2 : 0,
            maximumFractionDigits: 2
        });
    }

    function changePassword(event) {
        event.preventDefault();
        var form = byId("changePasswordForm");
        var status = byId("passwordStatus");
        var payload = formJson(form);

        if (payload.newPassword !== payload.confirmPassword) {
            setStatus(status, "Passwords do not match.", "error");
            return;
        }
        delete payload.confirmPassword;

        setStatus(status, "Changing password...");
        api("/api/admin/change-password", {
            method: "POST",
            body: JSON.stringify(payload)
        }).then(function (result) {
            setStatus(status, result.message, "success");
            form.reset();
        }).catch(function (error) {
            setStatus(status, error.message, "error");
        });
    }

    if (page === "login") initLogin();
    if (page === "forgot") initForgot();
    if (page === "reset") initReset();
    if (page === "accounts") initAdminAccountsPage();
    if (page === "faqs") initFaqsPage();
    if (page === "partners") initPartnersPage();
    if (page === "team") initTeamPage();
    if (page === "company") initCompanyPage();
    if (page === "home") initAdminHome();
    if (page === "articles") initArticlesPage();
    if (page === "products") initProductsPage();
    if (page === "leads") initLeadsPage();
    if (page === "password") initPasswordPage();
    if (page === "whistleblowing") {
        initProtectedPage(function () { return window.initWhistleblowingInbox(api); });
    }
}());
