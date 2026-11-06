/**
 * Interim "who may publish" rule (owner decision §11-Q5, 2026-11-06).
 *
 * Until Bagisto RBAC lands (Wave 7), the single demo admin account IS the owner — so the
 * Pages workspace shows publish controls in demo mode. In bagisto mode we hide them (and
 * the editor's onPublish is ignored) until real role checks exist.
 */
import { isDemoMode } from "@/config/env";

export const isOwnerSession = (): boolean => isDemoMode;
