import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { absUrl } from "@/config/site";
import { organizationJsonLd, websiteJsonLd, localBusinessJsonLd } from "@/data/seoContent";
import { JsonLd } from "@/components/JsonLd";

/**
 * Mounted once inside <BrowserRouter>. Owns the two things every route needs
 * regardless of which page renders:
 *
 *  1. <link rel="canonical"> pointing at the canonical origin for the current
 *     path (strips query strings — they are faceted URLs, not canonical pages).
 *  2. Site-wide Organization + WebSite (with SearchAction) + LocalBusiness
 *     JSON-LD. These describe the business, not the page, so they belong to no
 *     single page component.
 *
 * Page-specific schema (Product, Article, BreadcrumbList, FAQ…) stays on the
 * individual pages.
 */
const RouteHead = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    let canon = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canon) {
      canon = document.createElement("link");
      canon.setAttribute("rel", "canonical");
      document.head.appendChild(canon);
    }
    canon.setAttribute("href", absUrl(pathname));
  }, [pathname]);

  return (
    <>
      <JsonLd id="organization" data={organizationJsonLd()} />
      <JsonLd id="website" data={websiteJsonLd()} />
      <JsonLd id="localbusiness" data={localBusinessJsonLd()} />
    </>
  );
};

export default RouteHead;
