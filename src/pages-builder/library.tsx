/**
 * WOODEX builder — Library plugin for Puck's left rail (Wave 2, plan §5.2).
 * Tabs: Sections (40) · UI kit (17 elements) · Templates/Images (Wave 3).
 * Search + category chips; cards carry inline SVG thumbnails; "Add" inserts the
 * block (appends at the end by default — the editor's canvas drag-reorder and the
 * Layers outline panel handle positioning). Uses ONLY Puck's plugin API + React
 * context, no internal hooks (zero console noise).
 */
import { useContext, useMemo, useState } from "react";
import type { Plugin } from "@puckeditor/core";
import { LayoutGrid, Search, ListTree, Wand2, Image as ImageIcon, BookTemplate, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_CHIPS, CATEGORY_LABELS, ELEMENT_CATALOGUE, SECTION_CATALOGUE, SECTION_COUNT } from "./catalogue";
import type { CatalogueCategory, CatalogueEntry } from "./catalogue";
import { LibraryActionsContext } from "./shell";
import SectionThumb from "./thumbs";

type Tab = "sections" | "elements";

function Card({ entry, onAdd, isElement }: { entry: CatalogueEntry; onAdd: () => void; isElement?: boolean }) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md">
      <div className="relative h-16 border-b border-border">
        {isElement
          ? <div className="flex h-full items-center justify-center text-lg font-bold text-accent">Aa</div>
          : <SectionThumb category={entry.category} className="h-full w-full" />}
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add ${entry.label}`}
          title={`Add ${entry.label}`}
          className="absolute bottom-1 right-1 rounded-full border border-accent bg-accent/90 p-1 text-accent-foreground shadow transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </div>
      <p className="line-clamp-2 px-2 py-1.5 text-[10px] font-medium leading-tight text-foreground/90">{entry.label}</p>
    </div>
  );
}

function Panel() {
  const ctx = useContext(LibraryActionsContext);
  const [tab, setTab] = useState<Tab>("sections");
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<CatalogueCategory | "all">("all");

  const source = tab === "sections" ? SECTION_CATALOGUE : ELEMENT_CATALOGUE;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return source.filter((e) => {
      if (chip !== "all" && tab === "sections" && e.category !== chip) return false;
      if (!q) return true;
      return [e.label, e.type, tab === "sections" ? CATEGORY_LABELS[e.category] : "element"].some((f) => f.toLowerCase().includes(q));
    });
  }, [source, query, chip, tab]);

  return (
    <div className="flex h-full w-72 flex-col gap-2 p-2 text-[11px]">
      {/* Tabs */}
      <div role="tablist" aria-label="Library tabs" className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted p-1">
        <button role="tab" aria-selected={tab === "sections"} onClick={() => setTab("sections")} className={cn("flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 font-semibold", tab === "sections" ? "bg-background shadow-sm" : "text-muted-foreground")}>
          <LayoutGrid className="h-3.5 w-3.5" /> Sections
        </button>
        <button role="tab" aria-selected={tab === "elements"} onClick={() => setTab("elements")} className={cn("flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 font-semibold", tab === "elements" ? "bg-background shadow-sm" : "text-muted-foreground")}>
          <ListTree className="h-3.5 w-3.5" /> UI kit
        </button>
      </div>

      {/* Planned tabs (Wave 3) */}
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <span className="rounded border border-dashed border-border px-1.5 py-0.5" title="Wave 3">Templates · W3</span>
        <span className="rounded border border-dashed border-border px-1.5 py-0.5" title="Wave 3">Images · W3</span>
        <span className="ml-auto inline-flex items-center gap-1"><Wand2 className="h-3 w-3" /> {tab === "sections" ? `${SECTION_COUNT} sections` : `${ELEMENT_CATALOGUE.length} elements`}</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === "sections" ? "Search sections…" : "Search elements…"}
          aria-label="Search catalogue"
          className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      {/* Category chips (sections only) */}
      {tab === "sections" ? (
        <div className="flex flex-wrap gap-1">
          {CATEGORY_CHIPS.map((c) => (
            <button
              key={c.id}
              onClick={() => setChip(c.id)}
              aria-pressed={chip === c.id}
              className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors", chip === c.id ? "border-accent bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:text-foreground")}
            >
              {c.label}{c.id !== "all" ? ` ${c.count}` : ""}
            </button>
          ))}
        </div>
      ) : null}

      {/* Cards */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((entry) => (
            <Card key={entry.type} entry={entry} isElement={tab === "elements"} onAdd={() => ctx?.insert(entry.type)} />
          ))}
          {filtered.length === 0 ? <p className="col-span-2 py-6 text-center text-[11px] text-muted-foreground">Nothing matches “{query}”.</p> : null}
        </div>
      </div>

      <p className="flex items-start gap-1.5 border-t border-border pt-2 text-[10px] leading-4 text-muted-foreground">
        <MousePointerClick className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        Adds at the end of the page — drag to reorder in the canvas, or manage order/hide/lock in the Layers panel.
      </p>
    </div>
  );
}

export const libraryPlugin = (): Plugin => ({
  name: "library",
  label: "Library",
  icon: <BookTemplate className="h-5 w-5" aria-hidden />,
  render: () => <Panel />,
});

export const libraryImageIcon = ImageIcon; // re-export to keep tree-shaking simple for callers
