# New frontend integration contract

The new frontend runs on the same domain. Use relative URLs; CORS is not required.

## Frontend customer authentication

Endpoint: `POST /api/frontend-auth.php`.

Actions: `register`, `login`, `me`, `logout`, `password`.

Browser login/register uses `credentials: "same-origin"`; the API sets an HttpOnly `wx_fe_session` cookie and a readable `wx_fe_csrf` cookie.

```js
const response = await fetch('/api/frontend-auth.php', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({action: 'login', email, password, remember: true})
});
const data = await response.json();
```

Use `{action: 'me'}` to restore the session and `{action: 'logout'}` to sign out. Password changes require `X-WX-FE-CSRF: <data.csrf>` and `{action:'password', current, next}`.

For controlled non-browser clients, send `transport: 'bearer'` during login/register. The response includes an `access_token` beginning with `wxfe_`; send it as `Authorization: Bearer <token>` and use the returned CSRF value for writes.

Frontend users are separate from Admin users and have no Admin permissions.

## Existing Admin authentication

Admin remains at `/admin/`. Login is `POST /api/admin.php` with `{action:'login', email, password}`. Send the returned token only to Admin APIs as `X-WX-ADM: <token>`. Never expose Admin tokens to the public frontend.

Builder writes use the Admin-issued builder token as `X-WX-CSRF` on `/api/builder.php`.

## Public APIs

- Contact/lead and booking: `POST /api/forms.php`
- Visitor chat: `POST /api/chat.php`; retain returned `chat_id` and visitor `token`
- Signed quotation view: `/api/quote-view.php?id=<id>&t=<token>`
- WhatsApp webhook: `/api/whatsapp.php`

## Deployment order

1. Import the schema outside the web root.
2. Upload `public_html/`.
3. Merge the new frontend pages/assets without replacing `admin/` or `api/`.
4. Configure `_private/db.json` through Admin setup.
5. Test Admin login, frontend registration/login, contact form, booking, chat and protected paths.
6. Remove demo accounts before production.
