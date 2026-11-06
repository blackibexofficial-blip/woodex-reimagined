import { useMemo, useState } from "react";
import { FileText, Newspaper, Search, ExternalLink, Info } from "lucide-react";
import { blogPosts } from "@/data/blogPosts";
import { services } from "@/data/services";
import { formatDate, SectionCard, EmptyState } from "@/admin/components";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Content hub — read-only view of the storefront content collections today.
 * Full editing ships with the Bagisto/Laravel panel (docs/07-admin-integration);
 * until then, content changes are made in src/data/* and code-reviewed.
 */
export default function AdminContent() {
  const [tab, setTab] = useState<"blog" | "services">("blog");
  const [query, setQuery] = useState("");

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return blogPosts.filter((p) => !q || [p.title, p.excerpt, p.category, p.author].some((f) => f.toLowerCase().includes(q)));
  }, [query]);

  const filteredServices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services.filter((s) => !q || [s.title, s.tagline, s.shortTitle].some((f) => f.toLowerCase().includes(q)));
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "blog" | "services")}>
          <TabsList>
            <TabsTrigger value="blog"><Newspaper className="mr-1.5 h-3.5 w-3.5" />Blog posts ({filteredPosts.length})</TabsTrigger>
            <TabsTrigger value="services"><FileText className="mr-1.5 h-3.5 w-3.5" />Services ({filteredServices.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative sm:max-w-xs w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search content…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9 bg-white" />
        </div>
      </div>

      {/* headless note */}
      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Storefront content is code-managed (<code className="rounded bg-sky-100 px-1">src/data/blogPosts.ts</code>, <code className="rounded bg-sky-100 px-1">src/data/services.ts</code>).
          Editorial editing moves into the Bagisto/TailAdmin panel once the backend is live — see
          <code className="ml-1 rounded bg-sky-100 px-1">docs/07-admin-integration</code>.
        </p>
      </div>

      {tab === "blog" ? (
        <SectionCard title="Journal / Blog">
          {filteredPosts.length === 0 ? (
            <EmptyState icon={Newspaper} title="No posts match" hint="Try a different search term." />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredPosts.map((post) => (
                <li key={post.id} className="group overflow-hidden rounded-xl border border-border bg-white shadow-sm transition hover:shadow-md">
                  <div className="relative h-36 overflow-hidden">
                    <img src={post.image} alt={post.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    <Badge className="absolute left-3 top-3 border-0 bg-primary/80 text-hon-green-light backdrop-blur">{post.category}</Badge>
                  </div>
                  <div className="p-4">
                    <a href={`/blog/${post.id}`} target="_blank" rel="noreferrer" className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold leading-snug text-foreground">{post.title}</h3>
                      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:text-hon-green-dark" />
                    </a>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{post.excerpt}</p>
                    <p className="mt-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">{post.author} · {formatDate(post.date)} · {post.readTime}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ) : (
        <SectionCard title="Services catalogue">
          {filteredServices.length === 0 ? (
            <EmptyState icon={FileText} title="No services match" hint="Try a different search term." />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {filteredServices.map((service) => (
                <li key={service.slug} className="flex gap-4 rounded-xl border border-border p-4 transition hover:border-hon-green-light hover:shadow-sm">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-hon-green-pale text-sm font-black text-hon-green-dark">
                    {service.number}
                  </div>
                  <div className="min-w-0">
                    <a href={`/services/${service.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-hon-green-dark">
                      {service.title}
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{service.tagline}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}
    </div>
  );
}
