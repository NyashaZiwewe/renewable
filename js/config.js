(function () {
    "use strict";

    var pathname = window.location.pathname || "/";
    var appSubdirectory = pathname.match(/^(.*)\/(?:en|pt|admin)(?:\/|$)/i);
    var appPath = appSubdirectory
        ? appSubdirectory[1]
        : pathname.replace(/\/[^/]*$/, "").replace(/\/$/, "");
    var configuredBaseUrl = window.APP_PUBLIC_CONFIG && window.APP_PUBLIC_CONFIG.BASE_URL;
    var apiBaseUrl = "";
    if (configuredBaseUrl) {
        try {
            var configuredUrl = new URL(configuredBaseUrl, window.location.origin);
            if (configuredUrl.origin === window.location.origin) {
                apiBaseUrl = new URL("api", configuredUrl.pathname.replace(/\/$/, "") + "/").href.replace(/\/$/, "");
            }
        } catch (error) {
            // Ignore an invalid or cross-origin base and use the current site origin.
        }
    }
    if (!apiBaseUrl) {
        apiBaseUrl = (appPath || "") + "/api";
    }

    window.APP_CONFIG = Object.freeze({
        API_BASE_URL: apiBaseUrl
    });

    window.apiUrl = function (path) {
        var endpoint = String(path || "").replace(/^\/+/, "").replace(/^api\//i, "");
        var baseUrl = window.APP_CONFIG.API_BASE_URL.replace(/\/+$/, "");
        return new URL(baseUrl + "/" + endpoint, window.location.origin);
    };

    window.assetUrl = function (path) {
        var value = String(path || "").trim();
        if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return value;

        var apiPath = new URL(window.APP_CONFIG.API_BASE_URL, window.location.origin).pathname;
        var appPath = apiPath.replace(/\/api\/?$/i, "").replace(/\/$/, "");
        if (value.indexOf("/img/") === 0) return appPath + value;
        if (value.indexOf("../img/") === 0) return new URL(value, window.location.href).href;
        return value;
    };
})();
