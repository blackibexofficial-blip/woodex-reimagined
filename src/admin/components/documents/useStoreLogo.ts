/**
 * Store-level logo for the printable documents (Settings → Documents).
 * One image, every document family member: quotation, invoice, order,
 * purchase order, return, exchange. Undefined when unset or unread — the
 * sheets then stay typographic, exactly as they ship.
 */
import { useEffect, useState } from "react";
import { getAdminApi } from "@/api";

export function useStoreLogo(): string | undefined {
  const [logo, setLogo] = useState<string | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    getAdminApi()
      .getSettings()
      .then((s) => { if (alive) setLogo(s.storeLogo ?? undefined); })
      .catch(() => { /* logo is decorative — sheets render without it */ });
    return () => { alive = false; };
  }, []);
  return logo;
}
