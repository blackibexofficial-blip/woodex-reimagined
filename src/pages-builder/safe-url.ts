/** URLs supplied in builder link fields are untrusted. Never return an
 * executable scheme, browser-normalized backslash, control character or
 * protocol-relative URL. Invalid links are rendered without an href. */
export function safeBuilderHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const url = value.trim();
  if (!url || url.startsWith("//") || Array.from(url).some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 || char === "\\";
  })) return undefined;
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (scheme) {
    if (scheme === "mailto" || scheme === "tel") return url;
    if (scheme !== "http" && scheme !== "https") return undefined;
    if (!/^https?:\/\//i.test(url)) return undefined;
    try {
      const parsed = new URL(url);
      return parsed.hostname && !parsed.username && !parsed.password ? url : undefined;
    } catch { return undefined; }
  }
  return url;
}
