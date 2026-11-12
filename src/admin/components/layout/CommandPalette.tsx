/**
 * WOODEX 2030 Phase 2 (functional shell slice) — command palette.
 *
 * Doc 05 §3 rules implemented here:
 *   - Command palette via Ctrl/Cmd + K (toggles).
 *   - Search across page title, keywords and route aliases — every destination
 *     and keyword in the registry is searchable (keywords set in
 *     `src/admin/nav-registry.ts`, ≥2 per entry, gated by `npm run test:nav`).
 *
 * Deliberately NOT implemented yet (owner/policy gated — see
 * docs/2030/ADAPTATION-FIT-GAP.md §5): pinned/favourites, recently visited
 * (localStorage persistence needs the privacy decision), quick-create menu
 * beyond the verified `* /new` routes, compact sidebar mode.
 *
 * Keyboard behaviour: ⌘/Ctrl+K toggles; Escape closes (handled by the dialog);
 * arrow keys + Enter navigate (cmdk default).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Search, FilePlus2 } from "lucide-react";
import { NAV_GROUPS } from "@/admin/nav-registry";

/** Quick-create actions — only routes verified to exist in AdminApp.tsx. */
const QUICK_ACTIONS = [
  { id: "new-order", label: "New order", to: "/admin/orders/new", value: "new order create order add order" },
  { id: "new-invoice", label: "New invoice", to: "/admin/invoices/new", value: "new invoice create invoice add invoice" },
  { id: "new-product", label: "New product", to: "/admin/products/new", value: "new product create product add product catalogue" },
] as const;

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent);

  return (
    <>
      {/* Topbar trigger — visible affordance for the shortcut (2030 §4 topbar). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="command-palette-trigger"
        className="hidden items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm transition hover:border-accent hover:text-foreground sm:inline-flex"
      >
        <Search className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden lg:inline">Search screens…</span>
        <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-sans text-[10px] font-semibold leading-none text-muted-foreground">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        {/* Radix requires a title + description for accessible dialogs */}
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">Search admin screens and quick-create actions</DialogDescription>
        <CommandInput placeholder="Type a screen, keyword or alias…" autoFocus />
        <CommandList>
          <CommandEmpty>No screens or actions match that.</CommandEmpty>
          <CommandGroup heading="Navigate">
            {NAV_GROUPS.flatMap((group) =>
              group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.id}
                    value={`${item.label} ${item.keywords.join(" ")} ${group.label}`}
                    onSelect={() => go(item.to)}
                  >
                    <Icon className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</span>
                  </CommandItem>
                );
              }),
            )}
          </CommandGroup>
          <CommandGroup heading="Actions">
            {QUICK_ACTIONS.map((action) => (
              <CommandItem key={action.id} value={action.value} onSelect={() => go(action.to)}>
                <FilePlus2 className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                <span className="flex-1">{action.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
