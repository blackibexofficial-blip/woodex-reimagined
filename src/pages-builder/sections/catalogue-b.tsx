import { PreviewOnlyForm } from "../PreviewOnlyForm";
import { safeBuilderHref } from "../safe-url";
/**
 * WOODEX builder — catalogue sections, part B (Wave 2, plan §5.2).
 * Testimonials (3) · Team (2) · Call to action (3) · Content (4) · Forms (4) · Components (6) = 22 sections.
 */
import type { ComponentConfig } from "@puckeditor/core";
import { Button } from "@/components/ui/button";
import { Star, PhoneCall, MessageCircle, MapPin, Clock, Mail, Award, Send } from "lucide-react";
import { commonLayerFields, commonLayerDefaults, SectionShell, resolveLayerPermissions } from "../shell";
import { richTextField, RichHtml } from "../richtext";
import TailgridsCallout from "@/components/tailgrids/callout";

type P = Record<string, unknown>;
const str = (p: P, k: string, fb = "") => String(p[k] ?? fb);
const arr = <T,>(p: P, k: string): T[] => (Array.isArray(p[k]) ? (p[k] as T[]) : []);
const text = (label: string, fb = "") => ({ type: "text" as const, label, placeholder: fb });
const area = (label: string, fb = "") => ({ type: "textarea" as const, label, placeholder: fb });
const radio = <T extends string>(label: string, options: Array<{ label: string; value: T }>) => ({ type: "radio" as const, label, options });
const list = (label: string, arrayFields: Record<string, unknown>, defaultItem: Record<string, unknown>, summary: (item: any) => string, // eslint-disable-line @typescript-eslint/no-explicit-any
 max = 8) => ({
  type: "array" as const, label, max, min: 1, arrayFields, defaultItemProps: defaultItem, getItemSummary: summary,
});

const sec = (
  label: string,
  extraFields: Record<string, unknown>,
  defaults: Record<string, unknown>,
  render: (p: P) => React.ReactNode,
  shellClass = "",
): ComponentConfig<P> => ({
  label,
  fields: { ...commonLayerFields, ...extraFields },
  defaultProps: { ...commonLayerDefaults, ...defaults },
  resolvePermissions: resolveLayerPermissions,
  render: (props) => (
    <SectionShell hidden={str(props, "hidden")} locked={str(props, "locked")} label={label} className={shellClass} inspector={props._inspector}>
      <div className="container mx-auto px-4 py-14">{render(props)}</div>
    </SectionShell>
  ),
});

const stars = () => <span aria-label="5 out of 5" className="inline-flex gap-0.5">{[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-4 w-4 fill-hon-green-dark text-hon-green-dark" aria-hidden />)}</span>;
const wa = "https://wa.me/923208325997"; // seller WhatsApp-first channel (house default)

export const catalogueB: Record<string, ComponentConfig<P>> = {
  /* ---------------- TESTIMONIALS (3) ---------------- */
  TestimonialRow: sec("Testimonial row", {
    items: list("Reviews", { quote: { type: "textarea", label: "Quote" }, name: { type: "text", label: "Name" }, place: { type: "text", label: "Place" } }, { quote: "…", name: "Happy client", place: "Lahore" }, (i) => i.name ?? "Review", 4),
  }, { items: [{ quote: "The meeting-room table turned heads at our first board meeting.", name: "Ayesha Khan", place: "Corporate Director, DHA" }, { quote: "Delivery and installation in four days, flawless fit.", name: "Bilal Sheikh", place: "Homeowner, Bahria" }, { quote: "Our café's banquettes still look brand new after 18 months.", name: "Omer Farooq", place: "Hospitality owner, MM Alam" }] }, (p) => (
    <div className="grid gap-4 md:grid-cols-3">
      {arr<{ quote?: string; name?: string; place?: string }>(p, "items").map((t, i) => (
        <figure key={i} className="rounded-xl border border-border bg-card p-6">
          {stars()}
          <blockquote className="mt-3 text-sm leading-relaxed">“{t.quote}”</blockquote>
          <figcaption className="mt-3 text-xs font-semibold">{t.name}<span className="block font-normal text-muted-foreground">{t.place}</span></figcaption>
        </figure>
      ))}
    </div>
  )),
  TestimonialWall: sec("Testimonial wall", {
    title: text("Heading", "Over 4,900 five-star reviews"), items: list("Reviews", { quote: { type: "textarea", label: "Quote" }, name: { type: "text", label: "Name" } }, { quote: "…", name: "Client" }, (i) => i.name ?? "Review", 6),
  }, { title: "Over 4,900 five-star reviews", items: [{ quote: "Craftsmanship you can feel.", name: "Usman, Gulberg III" }, { quote: "Two kids, one dog, zero wobbles.", name: "Hina, Johar Town" }, { quote: "Office refit done under budget.", name: "Faraz, Canal Road" }, { quote: "After-sales is genuinely excellent.", name: "Maryam, DHA Phase 5" }, { quote: "The walnut finish is unreal.", name: "Saad, Bahria Town" }, { quote: "Measured twice, installed in a day.", name: "Nida, Cavalry Ground" }] }, (p) => (
    <>
      <h2 className="mb-8 text-center text-3xl font-bold">{str(p, "title")}</h2>
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
        {arr<{ quote?: string; name?: string }>(p, "items").map((t, i) => (
          <figure key={i} className="mb-4 break-inside-avoid rounded-xl border border-border bg-card p-5">
            {stars()}
            <blockquote className="mt-2 text-sm leading-relaxed">“{t.quote}”</blockquote>
            <figcaption className="mt-2 text-xs font-medium text-muted-foreground">{t.name}</figcaption>
          </figure>
        ))}
      </div>
    </>
  )),
  TestimonialSingle: sec("Testimonial — single big quote", {
    quote: area("Quote", "WOODEX turned our empty floor plate into a workspace our team refuses to leave."), name: text("Name", "Zainab Raza"), role: text("Role", "COO, Northlight Logistics"),
  }, { quote: "WOODEX turned our empty floor plate into a workspace our team refuses to leave.", name: "Zainab Raza", role: "COO, Northlight Logistics" }, (p) => (
    <figure className="mx-auto max-w-4xl text-center">
      {stars()}
      <blockquote className="mt-4 text-2xl font-semibold leading-snug sm:text-3xl">“{str(p, "quote")}”</blockquote>
      <figcaption className="mt-5 text-sm"><span className="font-bold">{str(p, "name")}</span><span className="block text-muted-foreground">{str(p, "role")}</span></figcaption>
    </figure>
  )),

  /* ---------------- TEAM (2) ---------------- */
  TeamGrid: sec("Team portrait grid", {
    title: text("Heading", "Meet the workshop team"), items: list("Members", { name: { type: "text", label: "Name" }, role: { type: "text", label: "Role" }, initials: { type: "text", label: "Initials (2 letters)" } }, { name: "Member", role: "Role", initials: "WM" }, (i) => i.name ?? "Member", 8),
  }, { title: "Meet the workshop team", items: [{ name: "Imran Sheikh", role: "Master Carpenter", initials: "IS" }, { name: "Kashif Mehmood", role: "Finishing Lead", initials: "KM" }, { name: "Rashid Ahmed", role: "Delivery & Install", initials: "RA" }, { name: "Sana Tariq", role: "Client Design", initials: "ST" }] }, (p) => (
    <>
      <h2 className="mb-8 text-center text-3xl font-bold">{str(p, "title")}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {arr<{ name?: string; role?: string; initials?: string }>(p, "items").map((m, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 text-center">
            <span className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-hon-green-pale text-lg font-extrabold text-hon-green-dark">{str(m as P, "initials", "WM")}</span>
            <p className="text-sm font-bold">{m.name}</p><p className="text-[11px] text-muted-foreground">{m.role}</p>
          </div>
        ))}
      </div>
    </>
  )),
  TeamRoles: sec("Team — role cards", {
    title: text("Heading", "Specialists behind every order"), items: list("Roles", { role: { type: "text", label: "Role" }, count: { type: "text", label: "Headcount" } }, { role: "Role", count: "4" }, (i) => i.role ?? "Role", 8),
  }, { title: "Specialists behind every order", items: [{ role: "Master carpenters", count: "12" }, { role: "Finishing & upholstery", count: "9" }, { role: "Site installers", count: "14" }, { role: "After-sales service", count: "6" }] }, (p) => (
    <>
      <h2 className="mb-6 text-3xl font-bold">{str(p, "title")}</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {arr<{ role?: string; count?: string }>(p, "items").map((r, i) => (
          <div key={i} className="rounded-xl border border-border p-5 text-center"><p className="text-3xl font-extrabold text-accent">{r.count}</p><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{r.role}</p></div>
        ))}
      </div>
    </>
  )),

  /* ---------------- CALL TO ACTION (3) ---------------- */
  CtaStrip: sec("CTA — strip", {
    text: text("Copy", "Showroom visits daily, 11:00–21:00 — bring your measurements."), ctaLabel: text("CTA label", "Get directions"), ctaHref: text("CTA link", "/showrooms"),
  }, { text: "Showroom visits daily, 11:00–21:00 — bring your measurements.", ctaLabel: "Get directions", ctaHref: "/showrooms" }, (p) => (
    <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
      <p className="font-semibold">{str(p, "text")}</p>
      <Button asChild className="bg-accent text-accent-foreground hover:bg-hon-green-dark"><a href={safeBuilderHref(str(p, "ctaHref", "#"))}>{str(p, "ctaLabel")}</a></Button>
    </div>
  )),
  CtaSplit: sec("CTA — split", {
    title: text("Heading", "Free site survey across Lahore"), subtitle: area("Sub", "Tell us your requirement — we measure, plan and price before you commit."), ctaLabel: text("CTA label", "Talk to the team"),
  }, { title: "Free site survey across Lahore", subtitle: "Tell us your requirement — we measure, plan and price before you commit.", ctaLabel: "Talk to the team" }, (p) => (
    <div className="grid items-center gap-6 rounded-2xl border border-border bg-hon-green-pale/50 p-8 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <h2 className="text-2xl font-extrabold">{str(p, "title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{str(p, "subtitle")}</p>
      </div>
      <div className="flex flex-col gap-2 sm:justify-self-end">
        <Button asChild className="bg-accent text-accent-foreground hover:bg-hon-green-dark"><a href={wa}><PhoneCall className="mr-1.5 h-4 w-4" />{str(p, "ctaLabel")}</a></Button>
        <Button asChild variant="outline"><a href="/contact">Email instead</a></Button>
      </div>
    </div>
  )),
  CtaBanner: sec("CTA — centered banner", {
    title: text("Heading", "Ready to transform the space?"), subtitle: area("Sub", "Visit any WOODEX showroom or chat with us on WhatsApp right now."), primaryLabel: text("Primary CTA", "Book showroom visit"), secondaryLabel: text("Secondary CTA", "Chat on WhatsApp"),
  }, { title: "Ready to transform the space?", subtitle: "Visit any WOODEX showroom or chat with us on WhatsApp right now.", primaryLabel: "Book showroom visit", secondaryLabel: "Chat on WhatsApp" }, (p) => (
    <div className="mx-auto max-w-3xl text-center">
      <h2 className="text-3xl font-extrabold sm:text-4xl">{str(p, "title")}</h2>
      <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{str(p, "subtitle")}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-hon-green-dark"><a href="/showrooms">{str(p, "primaryLabel")}</a></Button>
        <Button asChild size="lg" variant="outline"><a href={wa}><MessageCircle className="mr-1.5 h-4 w-4" />{str(p, "secondaryLabel")}</a></Button>
      </div>
    </div>
  )),

  /* ---------------- CONTENT (4) ---------------- */
  RichText: sec("Rich text section", {
    eyebrow: text("Eyebrow", ""), title: text("Title", "The story behind the workshop"), body: richTextField("Body", "Write the long-form copy here."),
  }, { eyebrow: "THE WOODEX WAY", title: "The story behind the workshop", body: "Three generations of woodworking, one obsessive standard: furniture that survives trend cycles, moves and families. Every order leaves our Lahore workshop after a 41-point inspection — or it doesn't leave at all." }, (p) => (
    <div className="mx-auto max-w-3xl">
      {str(p, "eyebrow") ? <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-accent">{str(p, "eyebrow")}</p> : null}
      <h2 className="mb-4 text-3xl font-bold">{str(p, "title")}</h2>
      <RichHtml as="div" className="mb-4 leading-relaxed text-foreground/90 [&_p]:mb-4" html={p.body} />
    </div>
  )),
  TwoColumnText: sec("Two-column text", {
    title: text("Title", "Warranty, in plain words"), left: area("Left column", "Frames and joints are covered for five years…"), right: area("Right column", "Fabric, foam and finishes carry a two-year cover…"),
  }, { title: "Warranty, in plain words", left: "Frames and joints are covered for five years on every WOODEX piece — including made-to-measure work. If it fails, we fix or replace it.", right: "Fabric, foam and finishes carry a two-year cover. Fair wear is excluded; defects and workmanship issues are not." }, (p) => (
    <>
      <h2 className="mb-6 text-3xl font-bold">{str(p, "title")}</h2>
      <div className="grid gap-6 leading-relaxed md:grid-cols-2"><p>{str(p, "left")}</p><p>{str(p, "right")}</p></div>
    </>
  )),
  FaqAccordion: sec("FAQ accordion", {
    title: text("Heading", "Questions, answered"), items: list("Questions", { q: { type: "text", label: "Question" }, a: { type: "textarea", label: "Answer" } }, { q: "Question?", a: "Answer." }, (i) => i.q ?? "Question", 10),
  }, { title: "Questions, answered", items: [{ q: "How long does delivery take?", a: "In-stock pieces ship in 3–5 days within Lahore, 5–9 days nationwide. Made-to-order takes 4–6 weeks." }, { q: "Do you dismantle and re-fit on relocation?", a: "Yes — our after-sales team offers relocation packing, dismantling and re-installation." }, { q: "Can I visit a showroom on Sunday?", a: "Yes, all showrooms open 11:00–21:00 every day." }] }, (p) => (
    <>
      <h2 className="mb-6 text-3xl font-bold">{str(p, "title")}</h2>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {arr<{ q?: string; a?: string }>(p, "items").map((item, i) => (
          <details key={i} className="group bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold">{item.q}<span aria-hidden className="text-accent transition-transform group-open:rotate-45">+</span></summary>
            <div className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{item.a}</div>
          </details>
        ))}
      </div>
    </>
  )),
  ServiceList: sec("Services grid", {
    title: text("Heading", "What we do besides sell furniture"), items: list("Services", { title: { type: "text", label: "Service" }, text: { type: "text", label: "Copy" } }, { title: "Service", text: "Copy." }, (i) => i.title ?? "Service", 6),
  }, { title: "What we do besides sell furniture", items: [{ title: "Office fit-outs", text: "Design, manufacture, deliver, install." }, { title: "3D space planning", text: "See the room before a single piece is built." }, { title: "Repair & re-polish", text: "Keep your pieces going for decades." }, { title: "Relocation", text: "Dismantle, move, reassemble — anywhere." }] }, (p) => (
    <>
      <h2 className="mb-6 text-3xl font-bold">{str(p, "title")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {arr<{ title?: string; text?: string }>(p, "items").map((s, i) => <div key={i} className="rounded-xl border border-border p-5"><p className="font-bold">{s.title}</p><p className="mt-1 text-sm text-muted-foreground">{s.text}</p></div>)}
      </div>
    </>
  )),

  /* ---------------- FORMS (4) ---------------- */
  EnquiryForm: sec("Enquiry form (WhatsApp-first)", {
    title: text("Heading", "Send an enquiry"), phoneHint: text("Phone hint", "03xx-xxxxxxx"), consent: text("Consent line", "We reply on WhatsApp within working hours. No spam, no sharing."),
  }, { title: "Send an enquiry", phoneHint: "03xx-xxxxxxx", consent: "We reply on WhatsApp within working hours. No spam, no sharing." }, (p) => (
    <div className="mx-auto max-w-xl">
      <h2 className="mb-4 text-center text-3xl font-bold">{str(p, "title")}</h2>
      <PreviewOnlyForm><form className="grid gap-3 rounded-2xl border border-border bg-card p-6" onSubmit={(e) => { e.preventDefault(); alert("Preview only. No submission was sent."); }}>
        <input required aria-label="Name" placeholder="Your name" className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-accent" />
        <input required aria-label="Phone / WhatsApp" placeholder={str(p, "phoneHint")} className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-accent" />
        <textarea required aria-label="Requirement" placeholder="Tell us about your requirement (space, pieces, timeline)…" className="min-h-24 rounded-lg border border-border bg-background p-3 outline-none focus:ring-2 focus:ring-accent" />
        <Button type="submit" className="h-11 bg-accent text-accent-foreground hover:bg-hon-green-dark"><Send className="mr-1.5 h-4 w-4" />Send enquiry</Button>
        <p className="text-center text-[11px] text-muted-foreground">{str(p, "consent")}</p>
      </form></PreviewOnlyForm>
    </div>
  )),
  NewsletterSignup: sec("Newsletter signup", {
    title: text("Heading", "The WOODEX letter"), subtitle: area("Sub", "One email a month: new collections, care guides, workshop stories."), placeholder: text("Placeholder", "you@example.com"),
  }, { title: "The WOODEX letter", subtitle: "One email a month: new collections, care guides, workshop stories.", placeholder: "you@example.com" }, (p) => (
    <div className="mx-auto max-w-xl text-center">
      <h2 className="text-2xl font-extrabold">{str(p, "title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{str(p, "subtitle")}</p>
      <PreviewOnlyForm newsletter><form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); alert("Preview only. No submission was sent."); }}>
        <input required type="email" aria-label="Email" placeholder={str(p, "placeholder")} className="h-11 flex-1 rounded-lg border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-accent" />
        <Button type="submit" className="h-11 bg-accent text-accent-foreground hover:bg-hon-green-dark">Subscribe</Button>
      </form></PreviewOnlyForm>
    </div>
  )),
  CallbackForm: sec("Callback request", {
    title: text("Heading", "We'll call you"), hours: text("Hours line", "Working hours: Mon–Sat, 11:00–21:00"),
  }, { title: "We'll call you", hours: "Working hours: Mon–Sat, 11:00–21:00" }, (p) => (
    <PreviewOnlyForm><form className="mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-border bg-card p-6" onSubmit={(e) => { e.preventDefault(); alert("Preview only. No submission was sent."); }}>
      <h2 className="text-xl font-extrabold">{str(p, "title")}</h2>
      <input required aria-label="Phone" placeholder="03xx-xxxxxxx" className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-accent" />
      <input aria-label="Best time" placeholder="Best time to call (e.g. tomorrow 11–1)" className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-accent" />
      <Button type="submit" className="h-11 bg-accent text-accent-foreground hover:bg-hon-green-dark">Schedule callback</Button>
      <p className="text-center text-[11px] text-muted-foreground">{str(p, "hours")}</p>
    </form></PreviewOnlyForm>
  )),
  NewsletterCard: sec("Newsletter — boxed card", {
    title: text("Heading", "Get the trade price list"), subtitle: area("Sub", "For architects, designers and procurement teams — updated weekly."), ctaLabel: text("Button", "Request trade access"),
  }, { title: "Get the trade price list", subtitle: "For architects, designers and procurement teams — updated weekly.", ctaLabel: "Request trade access" }, (p) => (
    <div className="mx-auto max-w-md rounded-2xl border border-accent/40 bg-hon-green-pale/50 p-6 text-center">
      <h2 className="text-xl font-extrabold">{str(p, "title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{str(p, "subtitle")}</p>
      <Button asChild className="mt-4 bg-accent text-accent-foreground hover:bg-hon-green-dark"><a href="/trade">{str(p, "ctaLabel")}</a></Button>
      <TailgridsCallout tone="info" className="mt-4 text-left">Trade partners receive the updated weekly price list every Monday.</TailgridsCallout>
    </div>
  )),

  /* ---------------- COMPONENTS (6) ---------------- */
  LogoStrip: sec("Logo strip", {
    title: text("Heading", "Trusted by teams at"), items: list("Logos (text wordmarks)", { name: { type: "text", label: "Company" } }, { name: "Company" }, (i) => i.name ?? "Logo", 8),
  }, { title: "Trusted by teams at", items: [{ name: "NORTHLIGHT LOGISTICS" }, { name: "CRESCENT BANK" }, { name: "PEARL CONTINENTAL" }, { name: "K-ELECTRIC" }, { name: "PAKISTAN RAILWAYS" }, { name: "UNIVERSITY OF LAHORE" }] }, (p) => (
    <>
      <p className="mb-4 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{str(p, "title")}</p>
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">
        {arr<{ name?: string }>(p, "items").map((l, i) => <span key={i} className="text-sm font-extrabold tracking-widest text-muted-foreground">{l.name}</span>)}
      </div>
    </>
  )),
  AwardsRow: sec("Awards & certifications", {
    items: list("Badges", { title: { type: "text", label: "Award" }, org: { type: "text", label: "Issuer" } }, { title: "Award", org: "Issuer" }, (i) => i.title ?? "Award", 4),
  }, { items: [{ title: "ISO 9001:2015", org: "Quality systems certified" }, { title: "Brand of the Year", org: "Pakistan Furniture Awards 2024" }, { title: "PSQCA registered", org: "Pakistan Standards & Quality Control" }] }, (p) => (
    <div className="flex flex-wrap items-center justify-center gap-4">
      {arr<{ title?: string; org?: string }>(p, "items").map((a, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4">
          <Award className="h-6 w-6 text-accent" aria-hidden />
          <span><span className="block text-sm font-bold">{a.title}</span><span className="text-[11px] text-muted-foreground">{a.org}</span></span>
        </div>
      ))}
    </div>
  )),
  MapSection: sec("Google map section", {
    title: text("Heading", "Visit the flagship showroom"), address: text("Address", "WOODEX Furniture, Main Boulevard, Lahore"),
  }, { title: "Visit the flagship showroom", address: "WOODEX Furniture, Main Boulevard, Gulberg, Lahore" }, (p) => (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h2 className="text-3xl font-bold">{str(p, "title")}</h2>
        <p className="mt-3 flex items-start gap-2 text-muted-foreground"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />{str(p, "address")}</p>
        <Button asChild variant="outline" className="mt-4"><a href={`https://maps.google.com/maps?q=${encodeURIComponent(str(p, "address"))}`} target="_blank" rel="noreferrer">Open in Google Maps</a></Button>
      </div>
      <iframe className="h-64 w-full rounded-2xl border border-border" src={`https://maps.google.com/maps?q=${encodeURIComponent(str(p, "address"))}&output=embed`} title={str(p, "address")} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
    </div>
  )),
  ContactCard: sec("Contact card", {
    title: text("Heading", "Talk to WOODEX"), phone: text("Phone", "042-3574 0000"), whatsapp: text("WhatsApp", "0300 83 25 997"), email: text("Email", "care@woodex.pk"),
  }, { title: "Talk to WOODEX", phone: "042-3574 0000", whatsapp: "0300 83 25 997", email: "care@woodex.pk" }, (p) => (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6">
      <h2 className="text-xl font-extrabold">{str(p, "title")}</h2>
      <ul className="mt-4 space-y-3 text-sm">
        <li className="flex items-center gap-2"><PhoneCall className="h-4 w-4 text-accent" aria-hidden /><a href={safeBuilderHref(`tel:${str(p, "phone").replace(/\s|-/g, "")}`)} className="hover:underline">{str(p, "phone")}</a></li>
        <li className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-accent" aria-hidden /><a href={wa} className="hover:underline">WhatsApp {str(p, "whatsapp")}</a></li>
        <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-accent" aria-hidden /><a href={safeBuilderHref(`mailto:${str(p, "email")}`)} className="hover:underline">{str(p, "email")}</a></li>
      </ul>
    </div>
  )),
  HoursCard: sec("Business hours card", {
    title: text("Heading", "Showroom hours"), line1: text("Weekdays", "Mon–Sat · 11:00–21:00"), line2: text("Sundays", "Sunday · 13:00–21:00"), line3: text("Public holidays", "Public holidays · call ahead"),
  }, { title: "Showroom hours", line1: "Mon–Sat · 11:00–21:00", line2: "Sunday · 13:00–21:00", line3: "Public holidays · call ahead" }, (p) => (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6">
      <h2 className="flex items-center gap-2 text-xl font-extrabold"><Clock className="h-5 w-5 text-accent" aria-hidden />{str(p, "title")}</h2>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground"><li>{str(p, "line1")}</li><li>{str(p, "line2")}</li><li>{str(p, "line3")}</li></ul>
    </div>
  )),
  ShowroomTeaser: sec("Showroom teaser", {
    title: text("Heading", "Our showrooms"), ctaLabel: text("CTA", "Find yours"),
  }, { title: "Our showrooms", ctaLabel: "Find yours" }, (p) => (
    <div className="overflow-hidden rounded-2xl border border-border bg-card md:grid md:grid-cols-2">
      <img src="/assets/showroom-gulberg.jpg" alt="WOODEX showroom, Gulberg" loading="lazy" className="h-56 w-full object-cover md:h-full" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      <div className="p-6">
        <h2 className="text-2xl font-extrabold">{str(p, "title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">Gulberg · DHA Phase 5 · Johar Town · Bahria Town — every showroom stocks the full WOODEX range, refreshed monthly.</p>
        <Button asChild className="mt-4 bg-accent text-accent-foreground hover:bg-hon-green-dark"><a href="/showrooms">{str(p, "ctaLabel")}</a></Button>
      </div>
    </div>
  )),
};
