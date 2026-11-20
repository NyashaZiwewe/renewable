# PHP API deployment

The active API entry point is `api/index.php`. The `api/.htaccess` rewrite maps
requests such as `/renewable/api/products?locale=en` to that entry point. The
browser API base is built from `BASE_URL` in `.env`, exposed through
`api/public-config.php`, with a path-based fallback in `js/config.js`.

## Hosting requirements

- PHP 8.1 or newer
- `pdo_mysql` when using the existing MySQL database
- `fileinfo`, `mbstring`, `iconv`, and `dom` PHP extensions
- `curl` to send Resend email notifications
- Apache/LiteSpeed `.htaccess` rewrite support enabled
- PHP upload limits of at least 5 MB per file and 6 MB per request

The PHP backend reads the existing `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
and `DB_PASSWORD` environment values (or the protected root `.env` file). It
uses the existing schema and can import non-empty JSON stores once when the
MySQL database is empty. Whistleblowing reports and conversation messages are
stored in the `whistleblowing_reports` and `whistleblowing_messages` database
tables; any existing `data/whistleblowing.json` records are imported once.
Whistleblowing requires database settings. Other API stores can still use the
existing `data/*.json` files when database settings are absent.

Reporter token emails are sent only when the reporter supplies an email address
and `RESEND_API_KEY` plus `LEAD_EMAIL_FROM` (or `RESET_EMAIL_FROM`) are configured
in `.env`. The submission response reports whether the email provider accepted
the message; the follow-up token is still shown on screen if email delivery is
unavailable. Admin notifications use `WHISTLEBLOWING_EMAIL`, falling back to the
recipient configured in Admin > Queries. Admin replies notify the reporter only
when the report includes an email address. Email failures and missing settings
are written to the PHP error log.

## Admin accounts and passwords

Signed-in administrators can create another administrator from **Admin > Add
administrator** using an email address and an initial password. Administrators
can update their own password from **Admin > Change password**.

For email resets, set `BASE_URL` to the public HTTPS site URL (including any
installation subdirectory). The default transport is Resend. Set
`RESEND_API_KEY` and a verified `RESET_EMAIL_FROM` or `LEAD_EMAIL_FROM` sender,
and enable PHP's cURL extension.

If your web host supports outgoing PHP mail, set `RESET_MAIL_TRANSPORT=mail`
and set `RESET_EMAIL_FROM` to a mailbox address your host allows, such as
`support@example.com`. Use the bare address for this transport. PHP
`mail()` reports whether the host accepted the message for sending. Check the
recipient's inbox and the host's mail logs to verify delivery.

Admins can request a link from **Forgot password?** on the sign-in page.
Reset links expire after 30 minutes. A successful reset invalidates outstanding
links and signs the administrator out of all active sessions.

## Admin password conversion

The previous Node backend stored admin passwords as scrypt hashes. PHP stores
new passwords using PHP's password hashing API and cannot verify those old
scrypt hashes. After uploading this backend, open a cPanel Terminal and run:

```sh
php api/create-admin.php admin@example.com
```

Enter and confirm the new password when prompted. The command updates that
existing admin account (or creates it if it does not exist) and revokes its old
sessions. Use the email address of the existing admin account.

## Rollout

Back up the current site and database before deploying. Upload the `api/`
directory and root `.htaccess`, confirm the API URL returns JSON, then sign in
and check the product, article, query, upload, and password-reset flows.
Apache/LiteSpeed serves the PHP API. Node remains only for the optional static
page generator (`npm run generate`).

## Company settings

Use **Admin > Company settings** to manage the company name, logo (upload or URL),
motto, physical address, call and WhatsApp numbers, and Facebook, LinkedIn,
YouTube and Twitter URLs. Include the country code in phone numbers. Blank
social links keep visible icons pointing to `#`; configured links open in a
new tab. Saved values apply to both language versions without regenerating pages.
Settings use the automatically created `company_settings` database table, or
`data/company-settings.json` when no database is configured.

## Team page

Use **Admin > Team** to edit the team/culture introduction and add, edit, order
or delete team members. Each profile needs a name, title and professional
summary. Portrait uploads are optional. Set a profile to **Published** to show
it on the public page; drafts are visible only to admins. Manage English and
Portuguese separately. Find the public page under **About Us > Team** at
`en/team.html` or `pt/equipa.html`; the legacy `team.html` redirects there.

Deploy `api/team.php` together with `api/lib.php`, the new admin/public pages,
JavaScript, shared headers/footers and CSS. The backend creates `team_content`
automatically. Without database settings it uses `data/team-en.json` and
`data/team-pt.json`. See `docs/team-api.md` for the API contract.
Run `python3 scripts/check-team-api.py` to check routing, authentication, CSRF,
validation, language separation and publication against temporary JSON stores.
This CLI check does not exercise a live MySQL database or HTTP transport.

Run `node scripts/check-team-ui.cjs` for simulated DOM checks of team cards
and modal content, close behavior and focus return in both languages.

The contact page shows a map beside the inquiry form (stacked on mobile).
In **Admin > Company settings > Map location**, enter an address, place name,
or coordinates. A blank map location uses the physical address; if both are
blank, the map shows Mozambique. The map includes a Google Maps link for
directions and requires no API key.

## Partner logos

Use **Admin > Partner logos** to add a partner name, logo (upload or URL) and
website URL. Saved partners appear in a logo carousel immediately above the
shared footer in both languages, including the reporting pages. Logos open
partner websites in a new tab. Edit, delete and reorder partners in admin.
An empty list hides the section. Automatic scrolling pauses on hover, keyboard
focus, or the Pause control, and is disabled for reduced-motion preferences.

Deploy `api/partners.php` with `api/lib.php`, `admin/partners.html`, the admin
dashboard, shared footer partials, CSS and JavaScript. `partner_content` is
created automatically for MySQL; the no-database fallback is
`data/partners.json`. See `docs/partners-api.md` for the API contract.

Run `python3 scripts/check-partners-api.py` for isolated API dispatch checks and
`node scripts/check-partners-ui.cjs` for simulated DOM carousel checks. These
do not exercise live MySQL or a browser layout.
