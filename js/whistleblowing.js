(function () {
    "use strict";

    const locale = document.documentElement.lang;
    const portuguese = locale === "pt";
    const messages = {
        connection: ["We could not reach the reporting service. Check your connection and try again.", "Não foi possível contactar o serviço de denúncias. Verifique a ligação e tente novamente."],
        unreadable: ["The reporting service returned an unreadable response.", "O serviço de denúncias devolveu uma resposta que não pôde ser lida."],
        unavailable: ["The reporting service is experiencing a technical problem. Try again later or contact the organization.", "O serviço de denúncias está com um problema técnico. Tente novamente mais tarde ou contacte a organização."],
        not_found: ["Conversation not found. Enter the full token exactly as provided, without spaces. If you no longer have the token, contact the organization or submit a new report.", "Conversa não encontrada. Introduza o código completo tal como o recebeu, sem espaços. Se perdeu o código, contacte a organização ou apresente uma nova denúncia."],
        rate_limited: ["Too many submissions. Try later.", "Foram enviadas demasiadas denúncias. Tente novamente mais tarde."],
        invalid_email: ["Enter a valid email.", "Introduza um endereço de e-mail válido."],
        required: ["Complete all required fields.", "Preencha todos os campos obrigatórios."],
        declaration_required: ["Confirm all declarations.", "Confirme todas as declarações."],
        invalid_message: ["Enter a message.", "Introduza uma mensagem."],
        failed: ["Request failed.", "Não foi possível concluir o pedido."],
        received: ["Report received. Your follow-up token:", "Denúncia recebida. O seu código de acompanhamento:"],
        emailed: ["The token email was accepted for delivery. Check your inbox and spam folder, and save the token somewhere safe.", "O e-mail com o código foi aceite para envio. Verifique a caixa de entrada e a pasta de spam e guarde o código num local seguro."],
        emailFailed: ["We could not send the token email. Save this token now; it cannot be recovered later.", "Não foi possível enviar o e-mail com o código. Guarde-o agora, pois não poderá recuperá-lo mais tarde."],
        save: ["Save this token now; it cannot be recovered later.", "Guarde este código agora, pois não poderá recuperá-lo mais tarde."],
        status: ["Status:", "Estado:"],
        new: ["New", "Nova"],
        in_progress: ["In progress", "Em análise"],
        closed: ["Closed", "Encerrada"],
        organization: ["Organization", "Organização"],
        you: ["You", "Você"],
        noDate: ["Date unavailable", "Data indisponível"],
        reply: ["Write a follow-up", "Escreva uma mensagem de acompanhamento"],
        send: ["Send message", "Enviar mensagem"]
    };

    function translate(key) {
        return Object.hasOwn(messages, key) ? messages[key][portuguese ? 1 : 0] : "";
    }

    async function request(path, payload) {
        const options = payload ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        } : {};
        let response;
        try {
            response = await fetch(window.apiUrl(path), options);
        } catch {
            throw new Error(translate("connection"));
        }

        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error(translate("unreadable") + " (HTTP " + response.status + ")");
        }

        if (!response.ok) {
            if (response.status >= 500) throw new Error(translate("unavailable"));
            throw new Error(translate(data.error) || (!portuguese && data.message) || translate("failed"));
        }
        return data;
    }

    function showAlert(root, message, type) {
        const alert = document.createElement("div");
        alert.className = "alert alert-" + type;
        alert.textContent = message;
        root.replaceChildren(alert);
        return alert;
    }

    const reportForm = document.querySelector("#reportForm");
    if (reportForm) {
        const result = document.querySelector("#reportResult");
        const submit = reportForm.querySelector('button[type="submit"]');
        reportForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            submit.disabled = true;
            const data = Object.fromEntries(new FormData(reportForm));
            data.locale = locale;
            for (const name of ["policyAware", "truthful", "acknowledged"]) {
                data[name] = reportForm.elements[name].checked;
            }

            try {
                const report = await request("whistleblowing", data);
                const alert = showAlert(result, translate("received") + " ", "success");
                const token = document.createElement("strong");
                token.textContent = report.token;
                const advice = document.createElement("p");
                advice.textContent = translate(data.email ? (report.emailSent ? "emailed" : "emailFailed") : "save");
                alert.append(token, advice);
                reportForm.reset();
            } catch (error) {
                showAlert(result, error.message, "danger");
            } finally {
                submit.disabled = false;
            }
        });
    }

    const tokenForm = document.querySelector("#tokenForm");
    if (!tokenForm) return;

    const conversation = document.querySelector("#conversation");
    const endpoint = "whistleblowing/conversation";
    let conversationRequest = 0;

    async function loadConversation(token) {
        const requestId = ++conversationRequest;
        try {
            const data = await request(endpoint + "?token=" + encodeURIComponent(token));
            if (requestId === conversationRequest) renderConversation(data, token);
        } catch (error) {
            if (requestId === conversationRequest) showAlert(conversation, error.message, "danger");
        }
    }

    function renderConversation(data, token) {
        const status = document.createElement("p");
        status.textContent = translate("status") + " " + (translate(data.status) || data.status);
        conversation.replaceChildren(status);

        for (const [index, message] of (data.messages || []).entries()) {
            const item = document.createElement("div");
            const isAdmin = message.from === "admin";
            item.className = isAdmin ? "whistle-message admin" : "whistle-message";
            const sender = document.createElement("strong");
            sender.textContent = translate(isAdmin ? "organization" : "you");
            const time = document.createElement("time");
            time.dateTime = message.createdAt || "";
            const date = new Date(message.createdAt);
            time.textContent = Number.isNaN(date.getTime()) ? (message.createdAt || translate("noDate")) : date.toLocaleString(locale, {
                year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
            });
            const body = document.createElement("div");
            // Existing reports store this automatic entry as the first message.
            body.textContent = portuguese && index === 0 && !isAdmin && message.body === "Report submitted."
                ? "Denúncia enviada."
                : (message.body || "");
            item.append(sender, time, body);
            conversation.append(item);
        }

        const form = document.createElement("form");
        const field = document.createElement("textarea");
        field.className = "form-control";
        field.name = "message";
        field.required = true;
        field.rows = 3;
        field.placeholder = translate("reply");
        field.setAttribute("aria-label", translate("reply"));
        const send = document.createElement("button");
        send.type = "submit";
        send.className = "btn btn-primary mt-2";
        send.textContent = translate("send");
        const result = document.createElement("div");
        result.setAttribute("role", "status");
        form.append(field, send, result);
        conversation.append(form);

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            send.disabled = true;
            const requestId = conversationRequest;
            try {
                await request(endpoint, { token, message: field.value });
                if (requestId === conversationRequest) await loadConversation(token);
            } catch (error) {
                showAlert(result, error.message, "danger");
                send.disabled = false;
            }
        });
    }

    tokenForm.addEventListener("submit", (event) => {
        event.preventDefault();
        loadConversation(new FormData(tokenForm).get("token").trim());
    });
})();
