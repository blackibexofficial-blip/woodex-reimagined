# WOODEX quotation builder and service enquiries

## Outcome

Upgrade the WOODEX e-quotation workflow around the uploaded A4 reference. Admins can edit quotations with a live document preview, manage the commercial terms centrally, and review service quote enquiries that are saved securely in Lovable Cloud. Resolve any remaining current preview typecheck/build errors without weakening security or changing the established theme.

## Work

1. **Reconcile preview errors**
   - Check the newest preview diagnostics against the current source, since the available error report may be stale.
   - Fix verified failures at their source; preserve generated database types and existing role/access checks.

2. **Quotation editor and live preview**
   - Use the supplied A4 document as the layout reference: WOODEX header, quote reference/date/validity, customer details, line items, totals, terms, and footer.
   - Extend the existing admin quote/template tools rather than introducing a disconnected quotation flow.
   - Keep the editable fields and A4 preview synchronized as the admin changes a quotation; retain print/download behavior.

3. **Admin-managed terms with storefront integration**
   - Make payment wording and relevant quote settings manageable by admins; do not hard-code the sample document’s tax, discount, delivery, validity, or payment values as business policy.
   - Provide a safe customer-facing read path for the current approved settings and use the same saved policy in generated quotations and relevant storefront quote displays.
   - Keep negotiated quote values tied to their saved quotation so later settings changes do not rewrite issued documents.

4. **Save service quote enquiries**
   - Connect service enquiry submissions to Lovable Cloud, retaining the service identity and submitted customer/project details.
   - Prefer the existing secured lead-capture and CRM pipeline if it fully supports the enquiry; add a narrowly scoped table only if required.
   - Keep public submissions insert-only and prevent public visitors from reading or changing submissions; expose records to authenticated authorized admins in the existing admin workflow.

5. **Verification**
   - Exercise quote editing and confirm the preview reflects changed items and terms before printing.
   - Submit a service enquiry and confirm it appears in the admin view.
   - Verify access rules for public submission and admin-only review, then check the newest preview diagnostics.

## Technical notes

- Preserve WOODEX semantic colors, existing typography, and current admin design patterns.
- Apply any database changes through Lovable Database migrations; include explicit grants before enabling RLS and creating policies for every new public table.
- Do not infer fixed commercial values from the attachment. Admin-managed terms are authoritative; saved quotations retain their own snapshots.
- Keep the storefront public path limited to approved quotation settings and never expose enquiry records to anonymous users.