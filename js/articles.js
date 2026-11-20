(function () {
    "use strict";

    var listMount = document.querySelector("[data-articles-list]");
    var detailMount = document.querySelector("[data-article-detail]");
    if (!listMount && !detailMount) return;

    var locale = document.body.getAttribute("data-locale") || "en";

    if (listMount) loadArticleList(listMount);
    if (detailMount) loadArticleDetail(detailMount);

    function loadArticleList(mount) {
        var emptyText = mount.getAttribute("data-empty") || "No articles have been published yet.";
        mount.textContent = locale === "pt" ? "A carregar artigos..." : "Loading articles...";

        fetch(window.apiUrl("articles?locale=" + encodeURIComponent(locale)), {
            headers: { Accept: "application/json" }
        }).then(function (response) {
            if (!response.ok) throw new Error("Articles unavailable.");
            return response.json();
        }).then(function (payload) {
            renderArticleList(mount, payload.articles || [], emptyText);
        }).catch(function () {
            mount.textContent = emptyText;
        });
    }

    function renderArticleList(mount, articles, emptyText) {
        mount.innerHTML = "";

        if (!articles.length) {
            mount.textContent = emptyText;
            return;
        }

        articles.forEach(function (article) {
            var item = document.createElement("article");
            item.className = "article-index-item";

            var date = document.createElement("time");
            date.dateTime = article.publishedAt || article.updatedAt || "";
            date.textContent = formatDate(article.publishedAt || article.updatedAt);

            var title = document.createElement("h2");
            title.className = "h4";
            var link = document.createElement("a");
            link.href = articleDetailHref(mount, article);
            link.textContent = article.title;
            title.appendChild(link);

            var summary = document.createElement("p");
            summary.textContent = article.summary || "";

            item.appendChild(date);
            item.appendChild(title);
            if (summary.textContent) item.appendChild(summary);
            mount.appendChild(item);
        });
    }

    function loadArticleDetail(mount) {
        var params = new URLSearchParams(window.location.search);
        var slug = params.get("slug") || "";
        var emptyText = mount.getAttribute("data-empty") || "Article slug is missing.";
        var notFoundText = mount.getAttribute("data-not-found") || "Article not found.";

        if (!slug) {
            renderArticleState(mount, emptyText);
            return;
        }

        mount.textContent = locale === "pt" ? "A carregar artigo..." : "Loading article...";

        fetch(window.apiUrl("articles/" + encodeURIComponent(slug) + "?locale=" + encodeURIComponent(locale)), {
            headers: { Accept: "application/json" }
        }).then(function (response) {
            if (response.status === 404) throw new Error(notFoundText);
            if (!response.ok) throw new Error(locale === "pt" ? "Artigo indisponivel." : "Article unavailable.");
            return response.json();
        }).then(function (payload) {
            renderArticleDetail(mount, payload.article);
        }).catch(function (error) {
            renderArticleState(mount, error.message || notFoundText);
        });
    }

    function renderArticleDetail(mount, article) {
        mount.innerHTML = "";
        if (!article) {
            renderArticleState(mount, mount.getAttribute("data-not-found") || "Article not found.");
            return;
        }

        var back = document.createElement("a");
        back.className = "article-back-link";
        back.href = mount.getAttribute("data-back-href") || (locale === "pt" ? "artigos.html" : "articles.html");
        back.textContent = mount.getAttribute("data-back-label") || (locale === "pt" ? "Voltar aos artigos" : "Back to articles");

        var date = document.createElement("time");
        date.dateTime = article.publishedAt || article.updatedAt || "";
        date.textContent = formatDate(article.publishedAt || article.updatedAt);

        var title = document.createElement("h2");
        title.textContent = article.title;

        var summary = document.createElement("p");
        summary.className = "article-detail-summary";
        summary.textContent = article.summary || "";

        mount.appendChild(back);
        mount.appendChild(date);
        mount.appendChild(title);
        if (summary.textContent) mount.appendChild(summary);

        if (article.imageUrl) {
            var image = document.createElement("img");
            image.className = "article-detail-image";
            image.src = window.assetUrl(article.imageUrl);
            image.alt = article.title;
            mount.appendChild(image);
        }

        var content = document.createElement("div");
        content.className = "article-rich-text";
        renderArticleContent(content, article.content || "");
        mount.appendChild(content);

        if (article.title) {
            document.title = article.title + " | " + document.title.split(" | ").slice(-1)[0];
        }
    }

    function renderArticleState(mount, message) {
        mount.innerHTML = "";
        var notice = document.createElement("div");
        notice.className = "notice";
        notice.textContent = message;
        mount.appendChild(notice);
    }

    function articleDetailHref(mount, article) {
        var detailPath = mount.getAttribute("data-detail-path") || (locale === "pt" ? "artigo.html" : "article.html");
        return detailPath + "?slug=" + encodeURIComponent(article.slug);
    }

    function formatDate(value) {
        if (!value) return "";
        return new Intl.DateTimeFormat(locale === "pt" ? "pt-MZ" : "en", {
            year: "numeric",
            month: "long",
            day: "numeric"
        }).format(new Date(value));
    }

    function renderArticleContent(node, value) {
        if (/<[a-z][\s\S]*>/i.test(value)) {
            node.innerHTML = value;
            node.querySelectorAll("img[src]").forEach(function (image) {
                image.src = window.assetUrl(image.getAttribute("src"));
            });
            return;
        }

        String(value || "").split(/\n{2,}/).forEach(function (paragraph) {
            var text = paragraph.trim();
            if (!text) return;
            var p = document.createElement("p");
            p.textContent = text;
            node.appendChild(p);
        });
    }
}());
