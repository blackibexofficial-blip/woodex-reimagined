import { Component, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Render, type Data } from "@puckeditor/core";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import type { StorefrontPageSnapshot } from "@/api/storefront-pages";
import { woodexConfig } from "./blocks";
import { BuilderDocProvider } from "./BuilderDocContext";
import { BuilderModeContext } from "./shell";
import { getRenderableStorefrontPage, UnsupportedStorefrontDocumentError } from "./storefront-source";
import "./builder.css";

type Result =
  | { slug: string; kind: "loading" }
  | { slug: string; kind: "missing" }
  | { slug: string; kind: "unsupported" }
  | { slug: string; kind: "unavailable" }
  | { slug: string; kind: "ready"; page: StorefrontPageSnapshot };

const isSupportedSlug = (slug: string) => slug.length <= 128 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

/** Protect the rest of the site if an approved block unexpectedly throws. */
export class RenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <Message title="Page unavailable" text="This page cannot be displayed right now." /> : this.props.children;
  }
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="container mx-auto flex min-h-[45vh] max-w-xl flex-col justify-center gap-3 px-4 py-12">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground">{text}</p>
      <Link to="/" className="w-fit font-semibold text-accent underline">Return to home</Link>
    </div>
  );
}

/** Opt-in staging path. It does not confer authentication or production readiness. */
export default function PublishedPagePreview() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [result, setResult] = useState<Result>({ slug, kind: "loading" });
  // Render no stale result even during the render before an effect for a new slug runs.
  const current: Result = result.slug === slug ? result : { slug, kind: "loading" };

  useEffect(() => {
    let active = true;
    if (!isSupportedSlug(slug)) {
      setResult({ slug, kind: "missing" });
      return () => { active = false; };
    }
    setResult({ slug, kind: "loading" });
    getRenderableStorefrontPage(slug).then((page) => {
      if (active) setResult(page ? { slug, kind: "ready", page } : { slug, kind: "missing" });
    }).catch((error: unknown) => {
      if (active) setResult({ slug, kind: error instanceof UnsupportedStorefrontDocumentError ? "unsupported" : "unavailable" });
    });
    return () => { active = false; };
  }, [slug]);

  // This is a staging experiment, not indexable even if snapshot SEO requests indexing.
  // JS metadata is not a substitute for an X-Robots-Tag header on the staging server.
  useEffect(() => {
    const previousTitle = document.title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const created = !meta;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    const previous = meta.getAttribute("content");
    meta.content = "noindex,nofollow";
    return () => {
      document.title = previousTitle;
      if (created) meta?.remove();
      else if (previous === null) meta?.removeAttribute("content");
      else meta?.setAttribute("content", previous);
    };
  }, []);
  useEffect(() => {
    document.title = current.kind === "ready" ? `${current.page.seo.title?.trim() || current.page.title} — WOODEX preview` : "Published page preview — WOODEX";
  }, [current]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="border-b border-border bg-muted px-4 py-2 text-center text-xs font-medium" role="note">
        Staging preview — published content only. Not for public release.
      </div>
      <main className="flex-1" id="main-content">
        {current.kind === "loading" ? (
          <div role="status" className="container mx-auto px-4 py-16">Loading published page…</div>
        ) : current.kind === "missing" ? (
          <Message title="Page not found" text="No published page is available at this address." />
        ) : current.kind === "unsupported" ? (
          <Message title="Page unavailable" text="This page is not supported in the staging preview." />
        ) : current.kind === "unavailable" ? (
          <Message title="Page unavailable" text="The page service is temporarily unavailable. Please try again later." />
        ) : (
          <RenderBoundary key={slug}>
            <BuilderModeContext.Provider value="public">
              <BuilderDocProvider linkedStyles={[]}>
                <Render config={woodexConfig} data={current.page.doc as unknown as Data} />
              </BuilderDocProvider>
            </BuilderModeContext.Provider>
          </RenderBoundary>
        )}
      </main>
      <Footer />
    </div>
  );
}
