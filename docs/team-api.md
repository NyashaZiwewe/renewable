# Team page API

`GET /api/team?locale=en|pt` returns `{intro, members}`. Only published members
are returned, in admin-defined order. No authentication is needed.

`GET /api/admin/team?locale=en|pt` returns the full `{intro, members}` document.
`PUT /api/admin/team?locale=en|pt` replaces it with a validated JSON document.
Both admin routes require an admin session; PUT also requires X-CSRF-Token.
The existing image upload endpoint supports team portraits.

`intro` is plain text (up to 5000 characters). Each member has `id`, `name`
(required, up to 160), `title` (required, up to 160), `summary` (required, up to
5000), `imageUrl` (optional http(s) or local /img path), and `status` (`draft`
or `published`). Up to 100 profiles per language. IDs are unique within a
language. Empty intro and member lists are valid. Invalid input returns 400;
unauthenticated requests return 401; invalid CSRF returns 403.

Content is stored separately for English and Portuguese in the team_content
MySQL table, with data/team-en.json and data/team-pt.json as no-database
fallbacks. Saving replaces the chosen language's document; admin editors should
coordinate changes to the same language. Public cards display name and title;
View more opens a modal with the professional summary. Content is plain text.
