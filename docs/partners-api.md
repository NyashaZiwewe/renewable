# Partner logos

GET /api/partners returns {partners: [...]} publicly. GET and PUT
/api/admin/partners require an admin session; PUT also requires X-CSRF-Token.
PUT replaces the ordered list (up to 100). Each partner has a unique id,
name (1–160 characters, used as logo alternative text), logoUrl (required,
http(s) URL or local image path), and websiteUrl (required full http(s) URL).
Invalid input returns 400. An empty list hides the public section.
The shared list appears in both language versions, above the footer.
Storage: partner_content singleton MySQL table, or data/partners.json without DB.
