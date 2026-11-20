(function () {
    "use strict";
    var mount = document.querySelector("[data-team-list]");
    if (!mount) return;
    var pt = document.body.getAttribute("data-locale") === "pt";
    var dialog, modalName, modalTitle, modalSummary, modalPhoto;
    mount.textContent = pt ? "A carregar a equipa..." : "Loading team...";
    fetch(window.apiUrl("team?locale=" + (pt ? "pt" : "en")), { headers: { Accept: "application/json" } })
        .then(function (response) {
            if (!response.ok) throw new Error("Team unavailable");
            return response.json();
        }).then(function (content) {
            if (content.intro) document.querySelector("[data-team-intro]").textContent = content.intro;
            mount.replaceChildren();
            if (!content.members.length) mount.textContent = mount.getAttribute("data-empty");
            content.members.forEach(renderMember);
        }).catch(function () { mount.textContent = mount.getAttribute("data-error"); });

    function element(tag, className, text) {
        var node = document.createElement(tag);
        node.className = className || "";
        if (text) node.textContent = text;
        return node;
    }
    function portrait(member) {
        if (!member.imageUrl) {
            var placeholder = element("div", "team-portrait-placeholder");
            placeholder.setAttribute("aria-hidden", "true");
            placeholder.appendChild(element("i", "fa fa-user"));
            return placeholder;
        }
        var image = element("img", "team-portrait");
        image.src = window.assetUrl(member.imageUrl);
        image.alt = member.name;
        image.loading = "lazy";
        return image;
    }
    function renderMember(member) {
        var card = element("article", "product-card team-card");
        card.appendChild(portrait(member));
        var body = element("div", "product-card-body");
        body.appendChild(element("h2", "h4 mb-2", member.name));
        body.appendChild(element("p", "text-primary fw-bold", member.title));
        var more = element("button", "btn btn-outline-primary", pt ? "Ver mais" : "View more");
        more.type = "button";
        more.setAttribute("aria-label", (pt ? "Ver mais sobre " : "View more about ") + member.name);
        more.addEventListener("click", function () { showMember(member, more); });
        body.appendChild(more);
        card.appendChild(body);
        mount.appendChild(card);
    }
    function ensureDialog() {
        if (dialog) return;
        dialog = element("dialog", "product-details-dialog team-dialog");
        dialog.setAttribute("aria-labelledby", "teamModalName");
        dialog.setAttribute("aria-describedby", "teamModalSummary");
        var content = element("div", "product-details-content");
        var header = element("div", "product-details-header");
        modalName = element("h2", "h4 mb-0");
        modalName.id = "teamModalName";
        var close = element("button", "product-details-close", "×");
        close.type = "button";
        close.setAttribute("aria-label", pt ? "Fechar" : "Close");
        close.addEventListener("click", function () { dialog.close(); });
        header.append(modalName, close);
        modalPhoto = element("div", "team-modal-photo");
        modalTitle = element("p", "text-primary fw-bold mt-3");
        modalSummary = element("p", "team-summary");
        modalSummary.id = "teamModalSummary";
        var body = element("div", "product-details-body");
        body.append(modalPhoto, modalTitle, modalSummary);
        content.append(header, body);
        dialog.appendChild(content);
        dialog.addEventListener("click", function (event) { if (event.target === dialog) dialog.close(); });
        document.body.appendChild(dialog);
    }
    function showMember(member, trigger) {
        ensureDialog();
        modalName.textContent = member.name;
        modalTitle.textContent = member.title;
        modalSummary.textContent = member.summary;
        modalPhoto.replaceChildren();
        if (member.imageUrl) modalPhoto.appendChild(portrait(member));
        dialog.onclose = function () { trigger.focus(); };
        dialog.showModal();
    }
}());
