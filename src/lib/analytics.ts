/**
 * WOODEX — GA4 (env-gated). When VITE_GA4_ID is blank the module is inert:
 * no script is injected, no network is touched, no console output.
 *
 * Usage: main.tsx calls initAnalytics() once at startup; <RouteHead /> calls
 * trackPageview(path) on every route change (it must because SPA navigations
 * never trigger a full page load).
 */
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
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

  trackWebVitals();
}

export function trackPageview(path: string): void {
  if (!isAnalyticsEnabled || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

let vitalsRegistered = false;

/**
 * Report Core Web Vitals (+FCP/TTFB) as GA4 events. Inert unless VITE_GA4_ID
 * is set. CLS is reported as its unitless score (x1000, GA4 scores its numeric
 * precision poorly otherwise); timings are whole milliseconds.
 */
export function trackWebVitals(): void {
  if (!isAnalyticsEnabled || typeof window === "undefined" || vitalsRegistered) return;
  vitalsRegistered = true;

  const send = (name: string, value: number) => {
    if (typeof window.gtag !== "function") return;
    window.gtag("event", "web_vitals", {
      metric_name: name,
      value: Math.round(value),
      page_path: window.location.pathname,
    });
  };

  onLCP((m) => send("LCP", m.value));
  onINP((m) => send("INP", m.value));
  onCLS((m) => send("CLS", m.value * 1000));
  onFCP((m) => send("FCP", m.value));
  onTTFB((m) => send("TTFB", m.value));
}
