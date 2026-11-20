window.initWhistleblowingInbox = function (api) {
    "use strict";

    function timestamp(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value || "Date unavailable");
        return date.toLocaleString(undefined, {
            year: "numeric", month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit", second: "2-digit"
        });
    }

    function addDetail(root, label, value) {
        const detail = document.createElement("p");
        const heading = document.createElement("strong");
        heading.textContent = label + ": ";
        detail.append(heading, document.createTextNode(value || "Not provided"));
        root.appendChild(detail);
    }

    function renderMessage(message) {
        const item = document.createElement("div");
        item.className = message.from === "admin" ? "msg admin" : "msg";
        const sender = document.createElement("strong");
        sender.textContent = message.from === "admin" ? "Organization" : "Reporter";
        const time = document.createElement("time");
        time.dateTime = message.createdAt || "";
        time.textContent = timestamp(message.createdAt);
        const body = document.createElement("div");
        body.textContent = message.body || "";
        item.append(sender, time, body);
        return item;
    }

    function renderReport(report) {
        const closed = report.status === "closed";
        const path = "/api/admin/whistleblowing/" + encodeURIComponent(report.id);
        const card = document.createElement("section");
        card.className = "report";
        const title = document.createElement("h2");
        title.textContent = "Report submitted " + timestamp(report.createdAt);
        const details = document.createElement("div");
        details.className = "report-details";
        [
            ["Status", report.status], ["Reporter", report.reporterType],
            ["Issue", report.outline], ["People involved", report.people],
            ["Time period", report.timePeriod], ["Ongoing", report.ongoing],
            ["Evidence links", report.proofLinks], ["Information source", report.informationNature],
            ["Previously contacted", report.superiors]
        ].forEach(([label, value]) => addDetail(details, label, value));

        const actionStatus = document.createElement("p");
        actionStatus.className = "action-status";
        actionStatus.setAttribute("role", "status");
        const actions = document.createElement("div");
        actions.className = "issue-actions";
        const pill = document.createElement("span");
        pill.className = closed ? "status-pill closed" : "status-pill";
        pill.textContent = closed ? "Closed" : (report.status === "in_progress" ? "In progress" : "New");
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = closed ? "btn btn-outline-primary" : "btn btn-outline-danger";
        toggle.textContent = closed ? "Reopen issue" : "Close issue";
        toggle.addEventListener("click", async () => {
            toggle.disabled = true;
            try {
                await api(path + "/status", {
                    method: "PUT",
                    body: JSON.stringify({ status: closed ? "in_progress" : "closed" })
                });
                await load();
            } catch (error) {
                actionStatus.textContent = error.message;
                toggle.disabled = false;
            }
        });
        actions.append(pill, toggle);

        const conversation = document.createElement("h3");
        conversation.textContent = "Conversation";
        card.append(title, details, actions, conversation);
        (report.messages || []).forEach(message => card.appendChild(renderMessage(message)));
        card.appendChild(actionStatus);

        if (closed) {
            const note = document.createElement("p");
            note.className = "empty";
            note.textContent = "This issue is closed. Reopen it to continue the conversation.";
            card.appendChild(note);
            return card;
        }

        const form = document.createElement("form");
        form.className = "reply";
        const field = document.createElement("textarea");
        field.className = "form-control";
        field.required = true;
        field.maxLength = 3000;
        field.placeholder = "Write a response to the reporter";
        const send = document.createElement("button");
        send.className = "btn btn-primary";
        send.textContent = "Send response";
        form.append(field, send);
        form.addEventListener("submit", async event => {
            event.preventDefault();
            send.disabled = true;
            try {
                await api(path + "/messages", {
                    method: "POST",
                    body: JSON.stringify({ message: field.value })
                });
                await load();
            } catch (error) {
                actionStatus.textContent = error.message;
                send.disabled = false;
            }
        });
        card.appendChild(form);
        return card;
    }

    async function load() {
        const status = document.getElementById("status");
        const root = document.getElementById("reports");
        try {
            const payload = await api("/api/admin/whistleblowing");
            const reports = payload.reports || [];
            status.textContent = reports.length + (reports.length === 1 ? " report" : " reports");
            root.replaceChildren(...reports.map(renderReport));
            if (!reports.length) {
                const empty = document.createElement("p");
                empty.className = "empty";
                empty.textContent = "No whistleblowing reports found.";
                root.appendChild(empty);
            }
        } catch (error) {
            status.textContent = error.message;
        }
    }

    return load();
};
