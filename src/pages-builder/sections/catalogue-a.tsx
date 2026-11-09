import { PreviewOnlyForm } from "../PreviewOnlyForm";
import { safeBuilderHref } from "../safe-url";
/**
 * WOODEX builder — catalogue sections, part A (Wave 2, plan §5.2).
 * Hero (6) · Features (6) · Pricing (3) · Stats & charts (3) = 18 sections.
 * Every section: token-styled, hidden/locked common fields, native permissions.
 */
import { lazy, Suspense } from "react";
import type { ComponentConfig } from "@puckeditor/core";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Truck, Hammer, Check, Phone, Ruler, Sofa, Armchair } from "lucide-react";
import { commonLayerFields, commonLayerDefaults, SectionShell, resolveLayerPermissions } from "../shell";
import TailgridsPricingCard from "@/components/tailgrids/pricing-card";
import TailgridsTabs from "@/components/tailgrids/tabs";
import TailgridsStatsCard from "@/components/tailgrids/stats-card";

type P = Record<string, unknown>;
const str = (p: P, k: string, fb = "") => String(p[k] ?? fb);
const arr = <T,>(p: P, k: string): T[] => (Array.isArray(p[k]) ? (p[k] as T[]) : []);

const text = (label: string, fb = "") => ({ type: "text" as const, label, placeholder: fb });
const area = (label: string, fb = "") => ({ type: "textarea" as const, label, placeholder: fb });
const radio = <T extends string>(label: string, options: Array<{ label: string; value: T }>) => ({ type: "radio" as const, label, options });
const list = (label: string, arrayFields: Record<string, unknown>, defaultItem: Record<string, unknown>, summary: (item: any) => string, // eslint-disable-line @typescript-eslint/no-explicit-any
 max = 6) => ({
  type: "array" as const, label, max, min: 1, arrayFields, defaultItemProps: defaultItem, getItemSummary: summary,
});

/** Section scaffold: shared chrome + WOODEX container. */
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

const ICONS: Record<string, typeof ShieldCheck> = { shield: ShieldCheck, truck: Truck, hammer: Hammer, phone: Phone, ruler: Ruler, sofa: Sofa, armchair: Armchair, check: Check };
const iconField = list("Items", { icon: { type: "select", label: "Icon", options: Object.keys(ICONS).map((v) => ({ label: v, value: v })) }, title: { type: "text", label: "Title" }, text: { type: "textarea", label: "Copy" } }, { icon: "shield", title: "Feature", text: "Copy." }, (i) => i.title ?? "Feature", 6);
const iconDefaults = [
  { icon: "shield", title: "5-Year Warranty", text: "Frames and joints covered across the WOODEX range." },
  { icon: "truck", title: "Nationwide Delivery", text: "Lahore, Karachi, Islamabad, Rawalpindi and beyond." },
  { icon: "hammer", title: "In-House Craft", text: "Built in our Lahore workshop, fitted by our own team." },
];
const trustRow = (items: string) => items.split("·").map((s) => s.trim()).filter(Boolean);

export const catalogueA: Record<string, ComponentConfig<P>> = {
  /* ---------------- HERO (6) ---------------- */
  HeroCentered: sec("Hero — centered with dual CTAs", {
    eyebrow: text("Eyebrow", "WOODEX LAHORE"), title: text("Headline", "Furniture that outlasts the brief"), subtitle: area("Sub", "Engineered wood, powder-coated steel, and a warranty on every piece."), ctaLabel: text("CTA label", "Book a showroom visit"), ctaHref: text("CTA link", "/showrooms"),
  }, { eyebrow: "WOODEX LAHORE", title: "Furniture that outlasts the brief", subtitle: "Engineered wood, powder-coated steel, and a warranty on every piece — built in our own workshop since day one.", ctaLabel: "Book a showroom visit", ctaHref: "/showrooms" }, (p) => (
    <div className="mx-auto max-w-3xl text-center">
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-accent">{str(p, "eyebrow")}</p>
      <h1 className="mb-4 text-4xl font-extrabold leading-tight sm:text-5xl">{str(p, "title")}</h1>
      <p className="mx-auto mb-6 max-w-2xl text-lg text-muted-foreground">{str(p, "subtitle")}</p>
      <div className="flex items-center justify-center gap-3">
        <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-hon-green-dark"><a href={safeBuilderHref(str(p, "ctaHref", "#"))}>{str(p, "ctaLabel")}</a></Button>
        <Button asChild size="lg" variant="outline"><a href="/shop">Browse catalogue</a></Button>
      </div>
    </div>
  )),
  HeroCenteredTrust: sec("Hero — centered with trust row", {
    title: text("Headline", "Pakistan's most trusted furniture workshop"), subtitle: area("Sub", ""), trust: text("Trust row (·-separated)", "48,000+ orders · 4.9/5 rating · 5-year warranty"),
  }, { title: "Pakistan's most trusted furniture workshop", subtitle: "Office, home and hospitality furniture — engineered in Lahore, delivered nationwide.", trust: "48,000+ orders · 4.9/5 rating · 5-year warranty" }, (p) => (
    <div className="mx-auto max-w-3xl text-center">
      <h1 className="mb-4 text-4xl font-extrabold leading-tight sm:text-5xl">{str(p, "title")}</h1>
      {str(p, "subtitle") ? <p className="mx-auto mb-6 max-w-2xl text-lg text-muted-foreground">{str(p, "subtitle")}</p> : null}
      <div className="mb-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-muted-foreground">
        {trustRow(str(p, "trust")).map((t, i) => <span key={i} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-accent" />{t}</span>)}
      </div>
      <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-hon-green-dark"><a href="/shop">Browse the catalogue</a></Button>
    </div>
  )),
  HeroForm: sec("Hero — text with enquiry form", {
    title: text("Headline", "Get a same-day quote"), subtitle: area("Sub", "Office or home — send your requirement, our team calls back within working hours."), formTitle: text("Form heading", "Request a callback"),
  }, { title: "Get a same-day quote", subtitle: "Office or home — send your requirement, our team calls back within working hours.", formTitle: "Request a callback" }, (p) => (
    <div className="grid items-center gap-10 lg:grid-cols-2">
      <div>
        <h1 className="mb-4 text-4xl font-extrabold leading-tight">{str(p, "title")}</h1>
        <p className="mb-6 text-lg text-muted-foreground">{str(p, "subtitle")}</p>
        <ul className="space-y-2 text-sm">{["Nationwide site visits for offices", "Showroom appointments 7 days a week", "GST-compliant invoicing for businesses"].map((t, i) => <li key={i} className="flex items-center gap-2"><Check className="h-4 w-4 text-accent" />{t}</li>)}</ul>
      </div>
      <PreviewOnlyForm><form className="rounded-2xl border border-border bg-card p-6 shadow-sm" onSubmit={(e) => { e.preventDefault(); alert("Preview only. No submission was sent."); }}>
        <p className="mb-4 font-bold">{str(p, "formTitle")}</p>
        <div className="grid gap-3">
          <input required aria-label="Your name" placeholder="Your name" className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-accent" />
          <input required aria-label="Phone" placeholder="03xx-xxxxxxx" className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-accent" />
          <select required aria-label="Requirement" defaultValue="" className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-accent">
            <option value="" disabled>I need…</option><option>Office furniture</option><option>Home furniture</option><option>Hospitality project</option><option>Custom build</option>
          </select>
          <Button type="submit" className="h-11 bg-accent text-accent-foreground hover:bg-hon-green-dark">Request callback</Button>
        </div>
      </form></PreviewOnlyForm>
    </div>
  )),
  HeroSplitForm: sec("Hero — split with enquiry form", {
    title: text("Headline", "Outfit your office in 6–8 weeks"), subtitle: area("Sub", "Desks, chairs, storage and partitions — designed, manufactured and installed by one accountable team."), formNote: text("Form footnote", "No commitment — site survey is free across Lahore."),
  }, { title: "Outfit your office in 6–8 weeks", subtitle: "Desks, chairs, storage and partitions — designed, manufactured and installed by one accountable team.", formNote: "No commitment — site survey is free across Lahore." }, (p) => (
    <div className="grid items-center gap-10 lg:grid-cols-2">
      <div>
        <h1 className="mb-4 text-4xl font-extrabold leading-tight">{str(p, "title")}</h1>
        <p className="mb-6 text-lg text-muted-foreground">{str(p, "subtitle")}</p>
        <Button asChild variant="outline"><a href="/services">Explore office projects</a></Button>
      </div>
      <PreviewOnlyForm><form className="rounded-2xl border border-border bg-card p-6 shadow-sm" onSubmit={(e) => { e.preventDefault(); alert("Preview only. No submission was sent."); }}>
        <div className="grid gap-3">
          <input required aria-label="Company" placeholder="Company name" className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-accent" />
          <input required aria-label="Phone or WhatsApp" placeholder="Phone / WhatsApp" className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-accent" />
          <input aria-label="Team size" placeholder="Team size (approx.)" className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-accent" />
          <Button type="submit" className="h-11 bg-accent text-accent-foreground hover:bg-hon-green-dark">Get a free site-survey slot</Button>
          <p className="text-[11px] text-muted-foreground">{str(p, "formNote")}</p>
        </div>
      </form></PreviewOnlyForm>
    </div>
  )),
  HeroSplitStats: sec("Hero — split with stats", {
    title: text("Headline", "Furniture that outlasts the brief"), image: text("Image URL", "/assets/showroom-hero.webp"), s1v: text("Stat 1 value", "48,000+"), s1l: text("Stat 1 label", "orders delivered"), s2v: text("Stat 2 value", "4.9/5"), s2l: text("Stat 2 label", "average rating"), s3v: text("Stat 3 value", "5 yr"), s3l: text("Stat 3 label", "warranty"),
  }, { title: "Furniture that outlasts the brief", image: "/assets/showroom-hero.webp", s1v: "48,000+", s1l: "orders delivered", s2v: "4.9/5", s2l: "average rating", s3v: "5 yr", s3l: "warranty" }, (p) => (
    <div className="grid items-center gap-10 lg:grid-cols-2">
      <div>
        <h1 className="mb-6 text-4xl font-extrabold leading-tight">{str(p, "title")}</h1>
        <div className="grid grid-cols-3 gap-4">
          {[[str(p, "s1v"), str(p, "s1l")], [str(p, "s2v"), str(p, "s2l")], [str(p, "s3v"), str(p, "s3l")]].map(([v, l], i) => (
            <div key={i}><p className="text-2xl font-extrabold text-accent">{v}</p><p className="text-xs text-muted-foreground">{l}</p></div>
          ))}
        </div>
      </div>
      {str(p, "image") ? <img src={str(p, "image")} alt="WOODEX showroom" loading="lazy" className="h-80 w-full rounded-2xl border border-border object-cover" /> : <div className="flex h-80 items-center justify-center rounded-2xl border border-dashed border-border text-xs text-muted-foreground">Set an image URL</div>}
    </div>
  )),
  HeroDark: sec("Hero — dark centered", {
    title: text("Headline", "Built in Lahore. Trusted worldwide."), subtitle: area("Sub", ""), ctaLabel: text("CTA label", "Book a private showroom tour"),
  }, { title: "Built in Lahore. Trusted worldwide.", subtitle: "Premium office and home furniture, engineered and installed by Pakistan's most accountable furniture team.", ctaLabel: "Book a private showroom tour" }, (p) => (
    <div className="mx-auto max-w-3xl text-center">
      <h1 className="mb-4 text-4xl font-extrabold leading-tight sm:text-5xl">{str(p, "title")}</h1>
      {str(p, "subtitle") ? <p className="mx-auto mb-6 max-w-2xl text-lg text-hon-green-pale/90">{str(p, "subtitle")}</p> : null}
      <Button asChild size="lg" variant="secondary"><a href="/showrooms">{str(p, "ctaLabel")}</a></Button>
    </div>
  ), "bg-hon-green-dark text-hon-green-pale"),

  /* ---------------- FEATURES (6) ---------------- */
  FeatureGrid: sec("Feature grid (3×2)", {
    title: text("Section title", "Why WOODEX"), items: iconField,
  }, { title: "Why WOODEX", items: iconDefaults }, (p) => {
    const items = arr<{ icon?: string; title?: string; text?: string }>(p, "items");
    return (<>
      <h2 className="mb-8 text-center text-3xl font-bold">{str(p, "title")}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => {
          const Ico = ICONS[item.icon ?? "shield"] ?? ShieldCheck;
          return (
            <div key={i} className="rounded-xl border border-border bg-card p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-hon-green-pale"><Ico className="h-6 w-6 text-accent" /></div>
              <h3 className="mb-1 font-bold">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.text}</p>
            </div>
          );
        })}
      </div>
    </>);
  }),
  FeatureIconList: sec("Features — icon list", {
    title: text("Heading", "What you get"), items: list("Items", { title: { type: "text", label: "Title" }, text: { type: "text", label: "Copy" } }, { title: "Feature", text: "Copy." }, (i) => i.title ?? "Feature", 6),
  }, { title: "What you get", items: [{ title: "Free site survey", text: "We measure, plan and price before a single sheet is cut." }, { title: "In-house manufacturing", text: "Every piece built in our Lahore workshop." }, { title: "White-glove installation", text: "Delivered, assembled and levelled by our own crew." }, { title: "5-year warranty", text: "Frames, joints and fittings — serviced by us." }] }, (p) => (
    <div className="grid gap-10 lg:grid-cols-5">
      <h2 className="text-3xl font-bold leading-snug lg:col-span-2">{str(p, "title")}</h2>
      <ul className="space-y-5 lg:col-span-3">
        {arr<{ title?: string; text?: string }>(p, "items").map((item, i) => (
          <li key={i} className="flex gap-4">
            <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-hon-green-pale"><Check className="h-4 w-4 text-accent" /></span>
            <span><span className="block font-semibold">{item.title}</span><span className="text-sm text-muted-foreground">{item.text}</span></span>
          </li>
        ))}
      </ul>
    </div>
  )),
  FeatureIconGrid2: sec("Feature grid — compact 2-col", {
    title: text("Heading", "Engineered for the long haul"), items: iconField,
  }, { title: "Engineered for the long haul", items: iconDefaults }, (p) => (
    <>
      <h2 className="mb-6 text-3xl font-bold">{str(p, "title")}</h2>
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {arr<{ icon?: string; title?: string; text?: string }>(p, "items").map((item, i) => {
          const Ico = ICONS[item.icon ?? "shield"] ?? ShieldCheck;
          return (
            <div key={i} className="flex gap-4 border-b border-border pb-5">
              <Ico className="mt-0.5 h-6 w-6 shrink-0 text-accent" />
              <span><span className="block font-semibold">{item.title}</span><span className="text-sm text-muted-foreground">{item.text}</span></span>
            </div>
          );
        })}
      </div>
    </>
  )),
  FeatureListImage: sec("Features — list with image", {
    title: text("Heading", "Designed by people who build"), image: text("Image URL", "/assets/workshop.jpg"), items: list("Items", { text: { type: "text", label: "Point" } }, { text: "Point." }, (i) => i.text ?? "Point", 6),
  }, { title: "Designed by people who build", image: "/assets/workshop.jpg", items: [{ text: "Seasoned hardwood and high-density board" }, { text: "Powder-coated steel bases" }, { text: "Made-to-measure upholstery in-house" }, { text: "Commercial-grade foam and suspension" }] }, (p) => (
    <div className="grid items-center gap-10 lg:grid-cols-2">
      <div>
        <h2 className="mb-6 text-3xl font-bold">{str(p, "title")}</h2>
        <ul className="space-y-3">
          {arr<{ text?: string }>(p, "items").map((item, i) => <li key={i} className="flex items-center gap-2 font-medium"><Check className="h-4 w-4 text-accent" />{item.text}</li>)}
        </ul>
      </div>
      {str(p, "image") ? <img src={str(p, "image")} alt="Inside the WOODEX workshop" loading="lazy" className="h-96 w-full rounded-2xl border border-border object-cover" /> : <div className="flex h-96 items-center justify-center rounded-2xl border border-dashed border-border text-xs text-muted-foreground">Set an image URL</div>}
    </div>
  )),
  BentoGallery: sec("Hero bento gallery", {
    title: text("Heading", "Rooms we've outfitted"), imageA: text("Large image", "/assets/office-1.jpg"), imageB: text("Small image 1", "/assets/office-2.jpg"), imageC: text("Small image 2", "/assets/living-1.jpg"),
  }, { title: "Rooms we've outfitted", imageA: "/assets/office-1.jpg", imageB: "/assets/office-2.jpg", imageC: "/assets/living-1.jpg" }, (p) => (
    <>
      <h2 className="mb-6 text-3xl font-bold">{str(p, "title")}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {str(p, "imageA") ? <img src={str(p, "imageA")} alt="Office project outfitted by WOODEX" loading="lazy" className="h-full min-h-64 w-full rounded-2xl border border-border object-cover md:row-span-2" /> : null}
        <div className="grid gap-4">
          {str(p, "imageB") ? <img src={str(p, "imageB")} alt="Executive office detail" loading="lazy" className="h-40 w-full rounded-2xl border border-border object-cover" /> : null}
          {str(p, "imageC") ? <img src={str(p, "imageC")} alt="Living room outfitted by WOODEX" loading="lazy" className="h-40 w-full rounded-2xl border border-border object-cover" /> : null}
        </div>
      </div>
    </>
  )),
  StepsRow: sec("4-step process", {
    title: text("Heading", "From sketch to sitting room in four steps"), steps: list("Steps", { title: { type: "text", label: "Step" }, text: { type: "textarea", label: "Copy" } }, { title: "Step", text: "Copy." }, (i) => i.title ?? "Step", 6),
  }, { title: "From sketch to sitting room in four steps", steps: [{ title: "1 · Consult", text: "Brief, measure and budget — free in Lahore." }, { title: "2 · Design", text: "Drawings and 3D previews before sign-off." }, { title: "3 · Build", text: "Manufactured in-house with quality gates." }, { title: "4 · Install", text: "White-glove delivery, levelling and handover." }] }, (p) => (
    <>
      <h2 className="mb-8 text-center text-3xl font-bold">{str(p, "title")}</h2>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {arr<{ title?: string; text?: string }>(p, "steps").map((s, i) => (
          <li key={i} className="rounded-xl border border-border bg-card p-5"><span className="mb-2 block font-bold text-accent">{s.title}</span><span className="text-sm text-muted-foreground">{s.text}</span></li>
        ))}
      </ol>
    </>
  )),

  /* ---------------- PRICING (3) ---------------- */
  PricingTable: sec("Pricing table", {
    title: text("Heading", "Office packages, priced honestly"), items: list("Packages", { name: { type: "text", label: "Package" }, price: { type: "text", label: "Price" }, includes: { type: "textarea", label: "Includes" } }, { name: "Package", price: "PKR 0", includes: "…" }, (i) => i.name ?? "Package", 4),
  }, { title: "Office packages, priced honestly", items: [{ name: "Starter 10-seat", price: "PKR 1.8M", includes: "Desks · ergonomic chairs · basic storage · delivery + install" }, { name: "Growth 25-seat", price: "PKR 4.2M", includes: "Everything in Starter + meeting table · partitions · brand wall" }, { name: "Enterprise", price: "Custom", includes: "Full-floor design · bespoke joinery · AMC support" }] }, (p) => (
    <>
      <h2 className="mb-6 text-3xl font-bold">{str(p, "title")}</h2>
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-hon-green-pale/60 text-left"><tr><th className="p-3">Package</th><th className="p-3">Price</th><th className="hidden p-3 sm:table-cell">Includes</th></tr></thead>
          <tbody>{arr<{ name?: string; price?: string; includes?: string }>(p, "items").map((row, i) => <tr key={i} className="border-t border-border"><td className="p-3 font-semibold">{row.name}</td><td className="p-3">{row.price}</td><td className="hidden p-3 text-muted-foreground sm:table-cell">{row.includes}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  )),
  PricingCards: sec("Pricing cards", {
    title: text("Heading", "Pick your package"), items: list("Cards", { name: { type: "text", label: "Name" }, price: { type: "text", label: "Price" }, blurb: { type: "textarea", label: "Blurb" }, features: { type: "textarea", label: "Features (one per line)" } }, { name: "Card", price: "PKR 0", blurb: "…", features: "Feature one\nFeature two" }, (i) => i.name ?? "Card", 3),
  }, { title: "Pick your package", items: [{ name: "Executive desk", price: "PKR 285,000", blurb: "1.8m executive desk in seasoned hardwood veneer.", features: "Seasoned hardwood veneer\nSoft-close drawers\nFree leveling & install" }, { name: "Ergo task chair", price: "PKR 68,000", blurb: "High-back, 10-year gas lift.", features: "Adjustable lumbar\nBreathable mesh\n10-year cylinder warranty" }, { name: "Manager workstation", price: "PKR 340,000", blurb: "Desk + pedestal + hutch.", features: "Made to measure\nCable management\nWhite-glove install" }] }, (p) => (
    <>
      <h2 className="mb-6 text-3xl font-bold">{str(p, "title")}</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {arr<{ name?: string; price?: string; blurb?: string; features?: string }>(p, "items").map((c, i) => (
          <TailgridsPricingCard key={i} name={c.name ?? "Plan"} price={c.price ?? ""} blurb={c.blurb} features={String(c.features ?? "").split("\n").map((f) => f.trim()).filter(Boolean)} featured={i === 1} ctaLabel="Talk to us" ctaHref="/contact" />
        ))}
      </div>
    </>
  )),
  PricingToggled: sec("Pricing — AMC plans (tabbed)", {
    title: text("Heading", "AMC plans"), monthly: text("Monthly plan", "PKR 45,000/mo — quarterly maintenance visits"), annual: text("Annual plan", "PKR 480,000/yr — save 11% + priority callouts + free annual re-polish"),
  }, { title: "AMC plans", monthly: "PKR 45,000/mo — quarterly maintenance visits", annual: "PKR 480,000/yr — save 11% + priority callouts + free annual re-polish" }, (p) => (
    <>
      <h2 className="mb-6 text-3xl font-bold">{str(p, "title")}</h2>
      <TailgridsTabs
        tabs={[
          { id: "monthly", label: "Monthly", content: <div className="rounded-xl border border-border bg-card p-6 font-semibold">{str(p, "monthly")}</div> },
          { id: "annual", label: "Annual — save 11%", content: <div className="rounded-xl border border-accent bg-card p-6 font-semibold shadow-sm">{str(p, "annual")}</div> },
        ]}
      />
    </>
  )),

  /* ---------------- STATS & CHARTS (3) ---------------- */
  StatsRow: sec("Stats row", {
    items: list("Stats", { value: { type: "text", label: "Value" }, label: { type: "text", label: "Label" }, delta: { type: "text", label: "Delta (optional, e.g. +12%)" } }, { value: "48,000+", label: "orders", delta: "" }, (i) => i.label ?? "stat", 5),
  }, { items: [{ value: "48,000+", label: "orders delivered", delta: "+9%" }, { value: "12,400+", label: "office projects", delta: "+14%" }, { value: "4.9/5", label: "average rating", delta: "" }, { value: "5 yr", label: "warranty", delta: "" }] }, (p) => (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {arr<{ value?: string; label?: string; delta?: string }>(p, "items").map((s, i) => <TailgridsStatsCard key={i} value={s.value ?? ""} label={s.label ?? ""} delta={s.delta || undefined} className="text-center" />)}
    </div>
  )),
  StatsBand: sec("Stats — dark band", {
    title: text("Heading", "The numbers behind WOODEX"), items: list("Stats", { value: { type: "text", label: "Value" }, label: { type: "text", label: "Label" } }, { value: "39", label: "years" }, (i) => i.label ?? "stat", 4),
  }, { title: "The numbers behind WOODEX", items: [{ value: "39", label: "years in business" }, { value: "320k", label: "sq ft workshop" }, { value: "96%", label: "on-time delivery" }] }, (p) => (
    <div className="text-center">
      <h2 className="mb-6 text-2xl font-extrabold">{str(p, "title")}</h2>
      <div className="grid grid-cols-3 gap-4">
        {arr<{ value?: string; label?: string }>(p, "items").map((s, i) => <div key={i}><p className="text-3xl font-extrabold text-hon-green-pale sm:text-4xl">{s.value}</p><p className="text-[11px] uppercase tracking-wide text-hon-green-pale/70">{s.label}</p></div>)}
      </div>
    </div>
  ), "bg-hon-green-dark text-hon-green-pale"),
  ChartBlock: sec("Sales trend chart (Recharts)", {
    title: text("Heading", "Showroom-visit trend"), kind: radio("Chart", [{ label: "Bars", value: "bar" }, { label: "Line", value: "line" }]),
  }, { title: "Showroom-visit trend", kind: "bar" }, (p) => (
    <>
      <h2 className="mb-4 text-2xl font-bold">{str(p, "title")}</h2>
      <Suspense fallback={<div className="h-56 w-full animate-pulse rounded-xl bg-muted" />}>
        <ChartLazy kind={str(p, "kind", "bar")} />
      </Suspense>
    </>
  )),
};

const ChartLazy = lazy(() => import("./ChartBlock"));
