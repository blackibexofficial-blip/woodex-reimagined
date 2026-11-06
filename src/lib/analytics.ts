/**
 * WOODEX — GA4 (env-gated). When VITE_GA4_ID is blank the module is inert:
 * no script is injected, no network is touched, no console output.
 *
 * Usage: main.tsx calls initAnalytics() once at startup; <RouteHead /> calls
 * trackPageview(path) on every route change (it must because SPA navigations
 * never trigger a full page load).
 */
import { config } from "@/config/env";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export const isAnalyticsEnabled = Boolean(config.ga4.id);

export function initAnalytics(): void {
  if (!isAnalyticsEnabled || typeof window === "undefined") return;
  if (document.querySelector('script[data-woodex-ga4="1"]')) return;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args: unknown[]) => {
    window.dataLayer!.push(args);
  };
  window.gtag("js", new Date());
  // We send page_view manually on route changes (see RouteHead).
  window.gtag("config", config.ga4.id, { send_page_view: false });

  const s = document.createElement("script");
  s.async = true;
  s.dataset.woodexGa4 = "1";
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.ga4.id)}`;
  document.head.appendChild(s);
}

export function trackPageview(path: string): void {
  if (!isAnalyticsEnabled || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}
