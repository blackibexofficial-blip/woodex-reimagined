import { Link } from "react-router-dom";
import { Palette, Briefcase, Newspaper, Wrench, ArrowRight, ExternalLink, Info, FileText } from "lucide-react";
import { useMaterials } from "@/lib/useMaterials";
import { useProjects } from "@/lib/useProjects";
import { useBlogPosts } from "@/lib/useBlogPosts";
import { useServices } from "@/lib/useServices";

/**
 * Content hub — launchpad for the four storefront content editors (P1.2–P1.5).
 * Each card links into the live editor and out to the rendered storefront page.
 * The read-only placeholder was retired once the editors shipped.
 */
export default function AdminContent() {
  const materials = useMaterials();
  const projects = useProjects();
  const { posts } = useBlogPosts();
  const { services } = useServices();

  const cards = [
    {
      icon: Palette,
      title: "Materials & Colors",
      tint: "bg-amber-100 text-amber-800",
      desc: "Wood species, finishes and colorway swatches — powers the storefront materials library and PDP finish pickers.",
      count: `${materials.length} materials`,
      editor: "/admin/materials",
      live: "/materials",
    },
    {
      icon: Briefcase,
      title: "Projects",
      tint: "bg-emerald-100 text-emerald-800",
      desc: "Case-study portfolio — client, sector, scope, photography and testimonials shown on /projects.",
      count: `${projects.length} projects`,
      editor: "/admin/projects",
      live: "/projects",
    },
    {
      icon: Newspaper,
      title: "Blog / Journal",
      tint: "bg-sky-100 text-sky-800",
      desc: "Articles with featured picks, categories, read time and an ordered content-block editor.",
      count: `${posts.length} posts`,
      editor: "/admin/blog",
      live: "/blog",
    },
    {
      icon: Wrench,
      title: "Services",
      tint: "bg-violet-100 text-violet-800",
      desc: "The services catalogue — overview, process steps, benefits, inclusions, FAQs and case studies per page.",
      count: `${services.length} services`,
      editor: "/admin/services",
      live: "/services",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="font-semibold">One roof for storefront content.</span> Each editor below writes straight to
          the live content store — changes appear on the site immediately, no deploy needed. A Bagisto/Laravel panel
          replaces this hub once the backend is provisioned (see <code className="rounded bg-emerald-100 px-1">docs/07-admin-integration</code>).
          Note: sitemap.xml is generated at build time — new content enters it on the next deploy.
        </p>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Storefront editors</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <div key={card.title} className="flex flex-col rounded-xl border border-border bg-white p-5 shadow-sm transition hover:shadow-md">
            <div className="flex items-start gap-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${card.tint}`}>
                <card.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold leading-snug text-foreground">{card.title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{card.desc}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{card.count}</span>
              <div className="flex items-center gap-2">
                <a
                  href={card.live}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-hon-green-dark"
                  aria-label={`View ${card.title} on the storefront`}
                  title="View on storefront"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <Link
                  to={card.editor}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  Open editor
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
