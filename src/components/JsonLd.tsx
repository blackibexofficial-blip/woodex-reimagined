import { useEffect } from "react";

/**
 * Declarative JSON-LD injector. Renders nothing; manages exactly one
 * <script type="application/ld+json"> in <head>, keyed by `id`.
 *
 * Multiple <JsonLd /> instances coexist as long as they use distinct ids.
 * Unmounting (or id change) removes the tag — safe across SPA route changes.
 */
export const JsonLd = ({ id, data }: { id: string; data: unknown }) => {
  useEffect(() => {
    const el = document.createElement("script");
    el.id = `jsonld-${id}`;
    el.type = "application/ld+json";
    // Escape "</" so a stray "</script>" inside content can't break out of the tag.
    el.text = JSON.stringify(data).replace(/</g, "\\u003c");
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, [id, data]);
  return null;
};
