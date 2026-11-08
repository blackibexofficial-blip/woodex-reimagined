/** WOODEX sales team roster (V4 PR-D). Demo-seeded; owner-editable in Settings → Team. */
export const DEFAULT_TEAM = ["Abdullah", "Nabeel", "Imtiaz"];
export const teamInitials = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => (w[0] ?? "").toUpperCase()).join("");
