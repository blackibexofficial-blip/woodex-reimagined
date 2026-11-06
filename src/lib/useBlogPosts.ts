import { useEffect, useState } from "react";
import { getAdminApi } from "@/api";
import type { AdminBlogPost } from "@/api/types";
import { blogPosts } from "@/data/blogPosts";

/**
 * Blog / Journal entries: admin-managed demo DB when seeded, otherwise the
 * bundled catalogue. Sorted newest-first (date desc, tolerant of the legacy
 * "Feb 15, 2025" format). Rows carry `active` — storefront pages filter it.
 *
 * `ready` flips true once the live query settles — crucial for deep links to
 * admin-created posts, which are absent from the bundled fallback on first paint.
 */
const staticFallback = (): AdminBlogPost[] =>
  blogPosts.map((p) => ({
    ...p,
    featured: p.featured ?? false,
    active: true,
    content: p.content.map((c) => ({ ...c })),
    tags: [...p.tags],
    createdAt: "",
    updatedAt: "",
  }));

const epoch = (d: string) => {
  const t = Date.parse(d);
  return Number.isNaN(t) ? 0 : t;
};

export function useBlogPosts(): { posts: AdminBlogPost[]; ready: boolean } {
  const [list, setList] = useState<AdminBlogPost[]>(staticFallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let on = true;
    getAdminApi()
      .listBlogPosts()
      .then((rows) => {
        if (!on) return;
        if (rows.length > 0) setList([...rows].sort((a, b) => epoch(b.date) - epoch(a.date)));
      })
      .catch(() => {
        /* demo API unavailable — bundled catalogue stays */
      })
      .finally(() => {
        if (on) setReady(true);
      });
    return () => {
      on = false;
    };
  }, []);

  return { posts: list, ready };
}
