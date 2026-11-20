(function () {
    "use strict";

    var mount = document.querySelector("[data-products-list]");
    if (!mount) return;

    var locale = document.body.getAttribute("data-locale") || "en";
    var emptyText = mount.getAttribute("data-empty") || "No products have been published yet.";
    var detailsModal = null;

    mount.textContent = locale === "pt" ? "A carregar produtos..." : "Loading products...";

    fetch(window.apiUrl("products?locale=" + encodeURIComponent(locale)), {
        headers: { Accept: "application/json" }
    }).then(function (response) {
        if (!response.ok) throw new Error("Products unavailable.");
        return response.json();
    }).then(function (payload) {
        renderProducts(payload.products || []);
    }).catch(function () {
        mount.textContent = emptyText;
    });

    function renderProducts(products) {
        mount.innerHTML = "";

        if (!products.length) {
            mount.textContent = emptyText;
            return;
        }

        products.forEach(function (product) {
            var card = document.createElement("article");
            card.className = "product-card";

            if (product.imageUrl) {
                var image = document.createElement("img");
                image.src = window.assetUrl(product.imageUrl);
                image.alt = product.name;
                image.loading = "lazy";
                card.appendChild(image);
            }

            var body = document.createElement("div");
            body.className = "product-card-body";

            var availability = document.createElement("span");
            availability.className = "product-availability " + product.availability;
            availability.textContent = availabilityLabel(product.availability);

            var title = document.createElement("h2");
            title.className = "h4";
            title.textContent = product.name;

            var price = document.createElement("div");
            price.className = "product-price";

            if (product.oldPrice != null && Number(product.oldPrice) > Number(product.price)) {
                var oldPrice = document.createElement("del");
                oldPrice.textContent = formatMoney(product.oldPrice, product.currency);
                price.appendChild(oldPrice);
            }

            var currentPrice = document.createElement("strong");
            currentPrice.textContent = formatMoney(product.price, product.currency);
            price.appendChild(currentPrice);

            var viewMore = document.createElement("button");
            viewMore.type = "button";
            viewMore.className = "btn btn-outline-primary product-view-more";
            viewMore.textContent = locale === "pt" ? "Ver detalhes" : "View more";
            viewMore.addEventListener("click", function () {
                showProductDetails(product);
            });

            body.appendChild(availability);
            body.appendChild(title);
            body.appendChild(price);
            body.appendChild(viewMore);
            card.appendChild(body);
            mount.appendChild(card);
        });
    }

    function showProductDetails(product) {
        ensureDetailsModal();
        detailsModal.querySelector(".product-details-title").textContent = product.name;
        var modalBody = detailsModal.querySelector(".product-details-body");
        modalBody.innerHTML = "";

        var layout = document.createElement("div");
        layout.className = "product-modal-layout" + (product.imageUrl ? " has-image" : " no-image");
        if (product.imageUrl) {
            var image = document.createElement("img");
            image.className = "product-modal-image";
            image.src = window.assetUrl(product.imageUrl);
            image.alt = product.name;
            layout.appendChild(image);
        }

        var details = document.createElement("div");
        details.className = "product-modal-details";
        var availability = document.createElement("span");
        availability.className = "product-availability " + product.availability;
        availability.textContent = availabilityLabel(product.availability);
        details.appendChild(availability);

        var description = document.createElement("p");
        description.textContent = product.description || "";
        if (description.textContent) details.appendChild(description);

        var price = document.createElement("div");
        price.className = "product-price";
        if (product.oldPrice != null && Number(product.oldPrice) > Number(product.price)) {
            var oldPrice = document.createElement("del");
            oldPrice.textContent = formatMoney(product.oldPrice, product.currency);
            price.appendChild(oldPrice);
        }
        var currentPrice = document.createElement("strong");
        currentPrice.textContent = formatMoney(product.price, product.currency);
        price.appendChild(currentPrice);
        details.appendChild(price);

        var properties = Array.isArray(product.properties) ? product.properties.filter(function (property) {
            return property && property.key && property.value;
        }) : [];
        if (properties.length) {
            var propertiesTitle = document.createElement("h3");
            propertiesTitle.className = "h5 mt-3";
            propertiesTitle.textContent = locale === "pt" ? "Características" : "Properties";
            details.appendChild(propertiesTitle);

            var list = document.createElement("dl");
            list.className = "product-modal-properties";
            properties.forEach(function (property) {
                var term = document.createElement("dt");
                term.textContent = property.key;
                var value = document.createElement("dd");
                value.textContent = property.value;
                list.appendChild(term);
                list.appendChild(value);
            });
            details.appendChild(list);
        }

        layout.appendChild(details);
        modalBody.appendChild(layout);
        if (!detailsModal.open) detailsModal.showModal();
    }

    function ensureDetailsModal() {
        if (detailsModal) return;
        detailsModal = document.createElement("dialog");
        detailsModal.className = "product-details-dialog";
        var content = document.createElement("div");
        content.className = "product-details-content";
        var header = document.createElement("div");
        header.className = "product-details-header";
        var title = document.createElement("h2");
        title.className = "product-details-title h4";
        title.id = "productDetailsModalLabel";
        title.textContent = locale === "pt" ? "Detalhes do produto" : "Product details";
        var close = document.createElement("button");
        close.type = "button";
        close.className = "product-details-close";
        close.setAttribute("aria-label", locale === "pt" ? "Fechar" : "Close");
        close.textContent = "×";
        close.addEventListener("click", function () {
            detailsModal.close();
        });
        header.appendChild(title);
        header.appendChild(close);

        var body = document.createElement("div");
        body.className = "product-details-body";
        var footer = document.createElement("div");
        footer.className = "product-details-footer";
        var closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.className = "btn btn-secondary";
        closeButton.textContent = locale === "pt" ? "Fechar" : "Close";
        closeButton.addEventListener("click", function () {
            detailsModal.close();
        });
        footer.appendChild(closeButton);
        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        detailsModal.appendChild(content);
        detailsModal.setAttribute("aria-labelledby", title.id);
        detailsModal.addEventListener("click", function (event) {
            if (event.target === detailsModal) detailsModal.close();
        });
        document.body.appendChild(detailsModal);
    }

    function availabilityLabel(value) {
        var labels = locale === "pt"
            ? {
                available: "Disponivel",
                limited: "Stock limitado",
                out_of_stock: "Sem stock",
                coming_soon: "Brevemente"
            }
            : {
                available: "Available",
                limited: "Limited stock",
                out_of_stock: "Out of stock",
                coming_soon: "Coming soon"
            };
        return labels[value] || labels.available;
    }

    function formatMoney(value, currency) {
        var amount = Number(value || 0);
        return (currency || "MZN") + " " + amount.toLocaleString(locale === "pt" ? "pt-MZ" : "en", {
            minimumFractionDigits: amount % 1 ? 2 : 0,
            maximumFractionDigits: 2
        });
    }
}());
