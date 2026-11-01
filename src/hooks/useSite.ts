import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSiteContent, fetchSiteContentItem, fetchSiteTheme, type SiteContentCard, type SiteContentDetail } from "@/lib/api/site";
import { services as serviceSnapshot, type ServiceData } from "@/data/services";
import { projectSnapshot, projectSlugs, type Project } from "@/data/projects";
import { seriesList as seriesSnapshot } from "@/data/products";
import { blogPosts as postSnapshot, type BlogPost } from "@/data/blogPosts";
import defaultServiceHero from "@/assets/service-custom-design.jpg";
import defaultPostImage from "@/assets/blog-ergonomic.jpg";

/**
 * Content for the storefront, read from the CMS with the bundled copy as the floor.
 *
 * The same bargain the catalogue makes: the first render is the copy that ships with the build, and the
 * API replaces it as soon as it answers. That is not only for previews — a shared-host PHP worker that is
 * out of capacity must not turn the services page into an empty list. It also means the site keeps working
 * in a preview with no backend, which is how designs get reviewed.
 *
 * The API is authoritative when it answers: a service deleted in the admin disappears here, because
 * "fall back on failure" and "ignore deletion" are not the same rule.
 */

const QUERY = {
  staleTime: 60_000,
  retry: 0,
  refetchOnWindowFocus: false,
} as const;

type ServicePayload = Partial<ServiceData>;
type ProjectPayload = Partial<Project>;
export type SeriesData = (typeof seriesSnapshot)[number];
type PostPayload = Partial<BlogPost> & { tags?: string[] };

function emptyService(card: SiteContentCard): ServiceData {
  return {
    slug: card.slug,
    number: "",
    title: card.title,
    shortTitle: card.title,
    tagline: card.excerpt,
    hero: defaultServiceHero,
    intro: "",
    metaTitle: card.seo?.title ?? card.title,
    metaDescription: card.seo?.description ?? card.excerpt,
    overview: { heading: "", body: "" },
    process: [],
    benefits: [],
    inclusions: [],
    faqs: [],
    caseStudy: { client: "", sector: "", result: "" },
    related: [],
  };
}

/** Cards from the API, merged over the bundled copy so an image or an un-migrated field never blanks out. */
function mergeServices(cards: SiteContentCard[] | undefined): ServiceData[] {
  if (!cards || cards.length === 0) return serviceSnapshot;

  const bySlug = new Map(serviceSnapshot.map((service) => [service.slug, service]));

  return cards.map((card) => {
    const base = bySlug.get(card.slug) ?? emptyService(card);
    const payload = (card as SiteContentCard & { payload?: ServicePayload }).payload ?? {};

    return {
      ...base,
      ...payload,
      slug: card.slug,
      // The row's own columns are what an editor changes; `payload` carries the extra fields only.
      title: card.title,
      tagline: card.excerpt || payload.tagline || "",
      metaTitle: card.seo?.title ?? base.metaTitle,
      metaDescription: card.seo?.description ?? base.metaDescription,
    } as ServiceData;
  });
}

function mergeService(detail: SiteContentDetail | undefined, slug: string): ServiceData | undefined {
  const snapshot = serviceSnapshot.find((service) => service.slug === slug);

  if (!detail) return snapshot;

  const base = snapshot ?? emptyService(detail);
  const payload = (detail.payload ?? {}) as ServicePayload;

  return {
    ...base,
    ...payload,
    slug,
    title: detail.title,
    tagline: detail.excerpt || payload.tagline || "",
    metaTitle: detail.seo?.title ?? base.metaTitle,
    metaDescription: detail.seo?.description ?? base.metaDescription,
  } as ServiceData;
}

export function useServices(): ServiceData[] {
  const { data } = useQuery({
    queryKey: ["site", "content", "service"],
    queryFn: ({ signal }) => fetchSiteContent("service", { signal }),
    ...QUERY,
  });

  return useMemo(() => mergeServices(data), [data]);
}

export function useService(slug: string | undefined): ServiceData | undefined {
  const { data } = useQuery({
    queryKey: ["site", "content", "service", slug],
    queryFn: ({ signal }) => fetchSiteContentItem("service", slug as string, { signal }),
    enabled: Boolean(slug),
    ...QUERY,
  });

  return useMemo(() => (slug ? mergeService(data, slug) : undefined), [data, slug]);
}

function mergePosts(cards: SiteContentCard[] | undefined): BlogPost[] {
  if (!cards || cards.length === 0) return postSnapshot;

  const byId = new Map(postSnapshot.map((post) => [post.id, post]));

  return cards.map((card) => {
    const base = byId.get(card.slug);
    const payload = ((card as SiteContentCard & { payload?: PostPayload }).payload ?? {}) as PostPayload;

    return {
      ...(base ?? {
        id: card.slug,
        title: card.title,
        excerpt: card.excerpt,
        image: defaultPostImage,
        category: "Insights",
        author: "WOODEX",
        date: "",
        readTime: "",
        content: [],
        tags: [],
      }),
      ...payload,
      id: card.slug,
      title: card.title,
      excerpt: card.excerpt || payload.excerpt || "",
      image: (payload.image || base?.image || defaultPostImage) as string,
      content: base?.content ?? [],
      tags: payload.tags ?? base?.tags ?? [],
    } as BlogPost;
  });
}

export function useBlogPosts(): BlogPost[] {
  const { data } = useQuery({
    queryKey: ["site", "content", "post"],
    queryFn: ({ signal }) => fetchSiteContent("post", { signal }),
    ...QUERY,
  });

  return useMemo(() => mergePosts(data), [data]);
}

/** Section blocks → the `content` array the article template already draws. */
function sectionsToContent(sections: { type?: string; heading?: string; text?: string }[]): { heading?: string; body: string }[] {
  return sections
    .filter((section) => (section.type === "text" || section.type === "intro") && typeof section.text === "string")
    .map((section) => ({ heading: section.heading || undefined, body: String(section.text) }));
}

export function useBlogPost(id: string | undefined): BlogPost | undefined {
  const { data } = useQuery({
    queryKey: ["site", "content", "post", id],
    queryFn: ({ signal }) => fetchSiteContentItem("post", id as string, { signal }),
    enabled: Boolean(id),
    ...QUERY,
  });

  return useMemo(() => {
    if (!id) return undefined;

    const snapshot = postSnapshot.find((post) => post.id === id);

    if (!data) return snapshot;

    const payload = (data.payload ?? {}) as PostPayload;
    const content = sectionsToContent((data.sections ?? []) as { type?: string; heading?: string; text?: string }[]);

    return {
      ...(snapshot ?? {
        id,
        title: data.title,
        excerpt: data.excerpt,
        image: defaultPostImage,
        category: "Insights",
        author: "WOODEX",
        date: "",
        readTime: "",
        content: [],
        tags: [],
      }),
      ...payload,
      id,
      title: data.title,
      excerpt: data.excerpt || payload.excerpt || "",
      image: (payload.image || snapshot?.image || defaultPostImage) as string,
      content: content.length > 0 ? content : (snapshot?.content ?? []),
      tags: payload.tags ?? snapshot?.tags ?? [],
    } as BlogPost;
  }, [data, id]);
}

export interface Showroom {
  city: string;
  address: string;
  phone: string;
  whatsapp: string;
  hours: string;
  lat: number;
  lng: number;
  isHQ: boolean;
}

const showroomSnapshot: Showroom[] = [
  { city: "Lahore (HQ)", address: "123 Gulberg III, Main Boulevard, Lahore", phone: "+92 42 111 WOODEX", whatsapp: "+923001234567", hours: "Mon–Sat: 9am–7pm", lat: 31.5204, lng: 74.3587, isHQ: true },
  { city: "Karachi", address: "456 Clifton Block 5, Karachi", phone: "+92 21 111 WOODEX", whatsapp: "+923001234567", hours: "Mon–Sat: 9am–7pm", lat: 24.8607, lng: 67.0011, isHQ: false },
  { city: "Islamabad", address: "789 Blue Area, F-7 Markaz, Islamabad", phone: "+92 51 111 WOODEX", whatsapp: "+923001234567", hours: "Mon–Sat: 10am–6pm", lat: 33.7294, lng: 73.0931, isHQ: false },
  { city: "Rawalpindi", address: "44 Saddar Road, Committee Chowk, Rawalpindi", phone: "+92 51 222 WOODEX", whatsapp: "+923001234567", hours: "Mon–Sat: 9am–7pm", lat: 33.6007, lng: 73.0679, isHQ: false },
  { city: "Faisalabad", address: "12 D-Ground, Faisalabad", phone: "+92 41 333 WOODEX", whatsapp: "+923001234567", hours: "Mon–Sat: 9am–6pm", lat: 31.4504, lng: 73.135, isHQ: false },
];

export function useShowrooms(): Showroom[] {
  const { data } = useQuery({
    queryKey: ["site", "content", "showroom"],
    queryFn: ({ signal }) => fetchSiteContent("showroom", { signal }),
    ...QUERY,
  });

  return useMemo(() => {
    if (!data || data.length === 0) return showroomSnapshot;

    const byCity = new Map(showroomSnapshot.map((room) => [room.city.toLowerCase(), room]));

    return data.map((card) => {
      const payload = ((card as SiteContentCard & { payload?: Partial<Showroom> }).payload ?? {}) as Partial<Showroom>;
      const city = String(payload.city ?? card.title.replace(/^WOODEX Showroom — /, ""));
      const base = byCity.get(city.toLowerCase());

      return {
        city,
        address: String(payload.address ?? card.excerpt),
        phone: String(payload.phone ?? base?.phone ?? ""),
        whatsapp: String(payload.whatsapp ?? base?.whatsapp ?? ""),
        hours: String(payload.hours ?? base?.hours ?? ""),
        lat: Number(payload.lat ?? base?.lat ?? 0),
        lng: Number(payload.lng ?? base?.lng ?? 0),
        isHQ: Boolean(payload.isHQ ?? base?.isHQ ?? false),
      };
    });
  }, [data]);
}

/**
 * Projects, merged the way the services are.
 *
 * The API's identity for a project is its slug; the bundled copy still keys on the numeric id the old
 * `/projects/1` links used. `projectSlugs` bridges the two, so a row edited in the admin lands on the right
 * card and a link that has already been shared keeps working.
 */
function mergeProjects(cards: SiteContentCard[] | undefined): Project[] {
  if (!cards || cards.length === 0) return projectSnapshot;

  const bySlug = new Map<string, Project>();

  for (const project of projectSnapshot) {
    const slug = projectSlugs[project.id];

    if (slug) bySlug.set(slug, project);
  }

  return cards.map((card) => {
    const base = bySlug.get(card.slug);
    const payload = ((card as SiteContentCard & { payload?: ProjectPayload }).payload ?? {}) as ProjectPayload;

    return {
      ...(base ?? {
        id: card.slug,
        title: card.title,
        client: "",
        category: "Corporate",
        image: card.image || projectSnapshot[0].image,
        location: "",
        sqft: "",
        description: card.excerpt,
      }),
      ...payload,
      id: base?.id ?? card.slug,
      slug: card.slug,
      title: card.title,
      // The column is what an editor changes; the payload fills everything the API does not carry yet.
      description: (payload.description as string) || card.excerpt || base?.description || "",
      image: base?.image ?? (card.image || projectSnapshot[0].image),
    } as Project;
  });
}

export function useProjects(): Project[] {
  const { data } = useQuery({
    queryKey: ["site", "content", "project"],
    queryFn: ({ signal }) => fetchSiteContent("project", { signal }),
    ...QUERY,
  });

  return useMemo(() => mergeProjects(data), [data]);
}

/**
 * One project, by CMS slug — or by the numeric id the first build of this page used.
 *
 * The console of an already-published page may still point at `/projects/3`; translating instead of 404ing
 * costs one line and keeps those visitors.
 */
export function useProject(idOrSlug: string | undefined): Project | undefined {
  const slug = idOrSlug ? (projectSlugs[idOrSlug] ?? idOrSlug) : undefined;
  const projects = useProjects();

  return useMemo(() => projects.find((project) => project.slug === slug || project.id === idOrSlug), [projects, slug, idOrSlug]);
}

function mergeSeries(cards: SiteContentCard[] | undefined): SeriesData[] {
  if (!cards || cards.length === 0) return seriesSnapshot;

  const byId = new Map(seriesSnapshot.map((series) => [series.id, series]));

  return cards.map((card) => {
    const base = byId.get(card.slug);
    const payload = ((card as SiteContentCard & { payload?: Partial<SeriesData> }).payload ?? {}) as Partial<SeriesData>;

    return {
      ...(base ?? {
        id: card.slug,
        name: card.title,
        tagline: card.excerpt,
        badge: "",
        description: card.excerpt,
        features: [] as string[],
        products: 0,
        color: "#5a7a3a",
      }),
      ...payload,
      id: card.slug,
      name: card.title,
      tagline: card.excerpt || payload.tagline || base?.tagline || "",
      description: (payload.description as string) || base?.description || card.excerpt,
      features: (payload.features as string[]) ?? base?.features ?? [],
    } as SeriesData;
  });
}

export function useSeriesList(): SeriesData[] {
  const { data } = useQuery({
    queryKey: ["site", "content", "series"],
    queryFn: ({ signal }) => fetchSiteContent("series", { signal }),
    ...QUERY,
  });

  return useMemo(() => mergeSeries(data), [data]);
}

export function useSeries(id: string | undefined): SeriesData | undefined {
  const series = useSeriesList();

  return useMemo(() => (id ? series.find((row) => row.id === id) : undefined), [series, id]);
}

/**
 * Applies the theme the admin edits, as CSS custom properties.
 *
 * The storefront is built on Tailwind's `hsl(var(--primary))` variables, so a token row is not decoration:
 * it is the colour. `:root` is what `index.css` already declares, which means the bundled palette is the
 * floor — an API that is down, or a theme with no rows, leaves the design exactly as built.
 */
export function useTheme(): void {
  const { data } = useQuery({
    queryKey: ["site", "theme"],
    queryFn: ({ signal }) => fetchSiteTheme({ signal }),
    ...QUERY,
  });

  useEffect(() => {
    const css = data?.css?.trim();

    if (!css) return;

    let style = document.getElementById("woodex-theme") as HTMLStyleElement | null;

    if (!style) {
      style = document.createElement("style");
      style.id = "woodex-theme";
      document.head.appendChild(style);
    }

    style.textContent = css;
  }, [data]);
}
