# 14 — Security and Permissions

## 1. Security principles

- Deny by default.
- Enforce authorization server-side for every action and record.
- Separate authentication from authorization.
- Least privilege.
- Audit high-impact actions.
- Protect client portal data by record ownership.
- Validate untrusted input.
- Keep secrets server-side.
- Use secure deployment defaults.
- Treat page-builder content as untrusted structured input.

## 2. Permission model

Permissions should describe actions, for example:
- `leads.view`, `leads.create`, `leads.update`, `leads.assign`, `leads.convert`
- `quotations.view`, `quotations.create`, `quotations.submit`, `quotations.approve`, `quotations.reject`, `quotations.issue`
- `invoices.view`, `invoices.create`, `invoices.issue`, `payments.record`, `payments.reverse`
- `orders.view`, `orders.create`, `orders.transition`
- `inventory.view`, `inventory.receive`, `inventory.transfer`, `inventory.adjust`
- `projects.view`, `projects.manage`, `projects.costs.view`, `projects.handover`
- `website.pages.view`, `website.pages.edit`, `website.pages.approve`, `website.pages.publish`
- `media.view`, `media.upload`, `media.delete`
- `users.manage`, `roles.manage`, `settings.manage`, `audit.view`

Role names map to permission sets. Do not authorize solely by checking a UI role label.

## 3. Approval controls

- Approval permission separate from edit permission.
- Define whether creator can approve their own record.
- Capture approver, timestamp, decision and reason.
- Use thresholds for quotation/discount/expense/PO only after owner defines them.
- Prevent duplicate approvals and replay.
- Record state transitions in audit log.

## 4. Client portal isolation

- Client users can access only records explicitly linked to their portal identity.
- Enforce scope on every API query, not only in the frontend.
- Prevent guessing IDs to access other customers' projects/documents.
- Separate internal notes from customer-visible messages.
- Expire/revoke portal sessions.
- Audit downloads and sensitive actions.

## 5. Authentication and session

Final mechanism depends on domain topology:
- Prefer secure HttpOnly cookies for same-site browser sessions when supported.
- CSRF protection for cookie-authenticated mutations.
- Strict CORS allowlist.
- Secure, HttpOnly and appropriate SameSite cookie settings.
- Token storage must not expose long-lived credentials to script access.
- Rate-limit login and recovery endpoints.
- Session invalidation on role/access changes.

## 6. Public forms and storefront

- Server-side validation.
- Rate limiting and abuse protection.
- Honeypot or challenge where appropriate.
- Normalize and validate phone/email.
- Consent and privacy notice where required.
- Avoid leaking internal lead IDs.
- Do not expose internal error messages.
- Restrict public form attachments.

## 7. Puck content security

- Allowlisted components only.
- Server-side prop schema validation.
- Sanitize rich text.
- Disallow executable scripts and arbitrary PHP/Blade.
- Restrict embed providers.
- Protect preview tokens with expiry and page/revision scope.
- Do not expose drafts to crawlers.
- Validate URL schemes and external destinations.
- Escape text at render time.

## 8. Financial and inventory integrity

- Server-side calculations.
- Database transactions.
- Immutable issued document snapshots.
- Reversal instead of silent deletion.
- Idempotency for payment and stock actions.
- Append-only stock ledger.
- Audit actor and reason for adjustments.
- Restrict exports and sensitive financial reports.

## 9. File and secret handling

- Secrets never committed.
- Production `.env` outside public root.
- File type and content validation.
- Randomized storage names.
- Private document authorization.
- Redact secrets and personal data from logs.
- Limit file access by role and relationship.

## 10. Audit events

At minimum audit:
- Login/security events.
- Role and permission changes.
- Lead assignment and conversion.
- Quotation approval/rejection/issue.
- Invoice issue and payment reversal.
- Order state transitions.
- Stock receipt/transfer/adjustment.
- Project cost and handover changes.
- Page publish/rollback and theme changes.
- Integration connection changes.
- Data export and deletion.

Audit records should be append-only to ordinary application users. Retention policy must be defined by the owner and applicable legal requirements.

## 11. Security acceptance

- Every protected endpoint has authorization tests.
- Client portal cross-account tests pass.
- Puck injection tests pass.
- Public form rate limits pass.
- Upload validation passes.
- No secrets in frontend bundle or repository.
- Production debug disabled.
- Backup and restore process protects confidentiality.
- High-impact actions are audited.
