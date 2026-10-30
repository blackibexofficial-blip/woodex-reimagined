import { useState, useEffect, useMemo } from "react";
import materialsHero from "@/assets/materials-hero.jpg";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useMaterials } from "@/hooks/useCatalog";
import type { ApiMaterialGroup, ApiMaterialOption } from "@/lib/api/types";

/**
 * What the shop will actually build.
 *
 * This page used to keep its own palette — six wood finishes, twelve fabric colours, five metal
 * finishes — none of which the catalogue had ever heard of. A visitor could choose a finish named after a coffee
 * roast, then find no product offering it, because the catalogue's one finish attribute has
 * three options. A brochure that outruns the factory is worse than a short one.
 *
 * So the palette is gone and the page renders `GET /materials`: every swatch attribute the OS
 * knows, grouped and counted. Editorial copy stays editorial — "Our Material Standards" is a
 * claim about how the furniture is made, not a list of SKUs — but every count on the page is
 * derived, and a finish nothing carries is shown as unavailable rather than as an option.
 */

/** How many published products offer this option, or null when the page is offline. */
function availability(option: ApiMaterialOption): string | null {
  if (option.products === null && option.variants === null) return null;
  const products = option.products ?? 0;
  const variants = option.variants ?? 0;

  if (products === 0 && variants === 0) return "Not currently offered";
  return `On ${products} ${products === 1 ? "product" : "products"}`;
}

function isPalette(group: ApiMaterialGroup): boolean {
  return group.options.some((option) => option.hex !== null);
}

/** A finish nobody sells is still drawn — greyed out, so the catalogue's gaps are visible. */
function isDead(option: ApiMaterialOption): boolean {
  if (option.products === null && option.variants === null) return false;
  return (option.products ?? 0) === 0 && (option.variants ?? 0) === 0;
}

const STANDARDS = [
  {
    id: "boards",
    name: "Boards & Veneers",
    description:
      "MDF, melamine-faced board and natural veneer, cut and edge-banded in our own workshop. Veneer is matched across a set so that a run of desks reads as one piece of timber rather than twenty.",
    properties: ["Edge-banded both faces", "Moisture-resistant core", "Matched veneer sets"],
  },
  {
    id: "steel",
    name: "Steel Frames",
    description:
      "Powder-coated steel in every frame we weld, from a two-leg desk to a four-tier storage wall. Coating is applied after fabrication, so the joints are covered and the frame does not rust at the welds.",
    properties: ["Powder-coated after welding", "2mm wall thickness", "Levelling feet as standard"],
  },
  {
    id: "upholstery",
    name: "Upholstery",
    description:
      "Mesh backs and moulded-foam seats for task seating, contract fabric and leather for sofas and reception. Foam density is specified by seat type, because a reception bench and a chair are not the same job.",
    properties: ["Contract-grade fabric", "Moulded foam, not cut block", "Replaceable covers on task chairs"],
  },
  {
    id: "hardware",
    name: "Hardware & Fittings",
    description:
      "Rated runners, soft-close hinges and lockable storage, sourced from suppliers we can re-order from in five years. A filing cabinet that cannot be re-keyed is a cabinet we do not sell.",
    properties: ["Rated drawer runners", "Re-orderable fittings", "Keyed-alike available"],
  },
];

const Materials = () => {
  const { groups, source, swatchCount, optionCount, error } = useMaterials();

  // Selection is keyed by option code, not by object identity: the API replaces the snapshot in
  // place, and a stored object would keep pointing at the copy that no longer renders.
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Materials & Colors — WOODEX Pakistan";
  }, []);

  const palettes = useMemo(() => groups.filter(isPalette), [groups]);
  const lists = useMemo(() => groups.filter((group) => !isPalette(group)), [groups]);

  const selected = useMemo(() => {
    for (const group of palettes) {
      const match = group.options.find((option) => option.code === selectedCode);
      if (match) return { group, option: match };
    }
    const first = palettes[0]?.options[0];
    return first ? { group: palettes[0], option: first } : null;
  }, [palettes, selectedCode]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative bg-primary text-primary-foreground py-20 overflow-hidden">
          <img src={materialsHero} alt="Materials & finishes" className="absolute inset-0 w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/85 to-primary/40" />
          <div className="container mx-auto px-4 relative">
            <p className="text-accent text-xs font-bold uppercase tracking-widest mb-2">Finishes & Fabrics</p>
            <h1 className="text-4xl lg:text-5xl font-black mb-3">Materials & Colors</h1>
            <p className="text-primary-foreground/75 max-w-xl">
              Every finish below is one we can build today, taken from the same catalogue the
              factory reads. Nothing here is a colour we hope to source later.
            </p>
            <p className="text-primary-foreground/50 text-xs mt-4">
              {swatchCount} {swatchCount === 1 ? "colour" : "colours"} · {optionCount} material
              {optionCount === 1 ? "" : "s"}
              {source === "snapshot" && (
                <span title={error?.message}> · catalogue snapshot</span>
              )}
            </p>
          </div>
        </section>

        {/* One section per swatch attribute, in the order the OS arranges them. */}
        {palettes.map((group, index) => {
          const options = group.options;
          const current = selected?.group.code === group.code ? selected.option : options[0];

          return (
            <section
              key={group.code}
              className={index % 2 === 1 ? "py-16 bg-section-light border-t" : "py-16"}
            >
              <div className="container mx-auto px-4">
                <div className="w-12 h-1 bg-accent mb-5" />
                <h2 className="text-3xl font-bold mb-2">{group.name}</h2>
                <p className="text-muted-foreground mb-10">
                  {options.length} {options.length === 1 ? "option" : "options"} available
                  {source === "snapshot" ? " in the bundled catalogue" : " in the live catalogue"}
                </p>
                <div className="grid lg:grid-cols-2 gap-10 items-start">
                  {/* Preview */}
                  <div className="sticky top-28">
                    <div
                      className="aspect-square rounded-sm border border-border flex items-center justify-center relative overflow-hidden"
                      style={{ backgroundColor: (current?.hex ?? "#B9A88F") + "22" }}
                    >
                      {current?.image ? (
                        <img src={current.image} alt={current.label} className="w-2/3 aspect-square object-cover rounded-sm shadow-xl border border-border" />
                      ) : (
                        <div
                          className="w-24 h-24 rounded-sm shadow-xl border border-border"
                          style={{ backgroundColor: current?.hex ?? "#B9A88F" }}
                        />
                      )}
                      <div className="text-center mt-4 px-6">
                        <h3 className="font-bold text-xl">{current?.label ?? "—"}</h3>
                        <p className="text-muted-foreground text-sm mt-1">
                          {current ? availability(current) ?? "Ask for current stock" : "No finishes listed"}
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* Swatches */}
                  <div className="grid grid-cols-2 gap-4">
                    {options.map((option) => {
                      const active = current?.code === option.code;
                      const dead = isDead(option);
                      return (
                        <button
                          key={option.code}
                          type="button"
                          onClick={() => setSelectedCode(option.code)}
                          aria-pressed={active}
                          className={`p-4 border rounded-sm text-left transition-all hover:shadow-md ${
                            active ? "border-accent shadow-md" : "border-border"
                          } ${dead ? "opacity-60" : ""}`}
                        >
                          <div
                            className="w-12 h-8 rounded mb-3 border border-border"
                            style={{ backgroundColor: option.hex ?? "#B9A88F" }}
                          />
                          <p className="font-semibold text-sm">{option.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {availability(option) ?? "Count unavailable offline"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          );
        })}

        {/* Attributes with no colour — build descriptions, not choices. */}
        {lists.map((group) => (
          <section key={group.code} className="py-16 bg-section-light border-t">
            <div className="container mx-auto px-4">
              <div className="w-12 h-1 bg-accent mb-5" />
              <h2 className="text-3xl font-bold mb-2">{group.name}</h2>
              <p className="text-muted-foreground mb-10">
                {group.options.length} build options, specified per product. {group.name.toLowerCase()} is
                not a colour you pick — it is what the piece is made of.
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {group.options.map((option) => (
                  <div
                    key={option.code}
                    className={`p-4 border rounded-sm bg-background ${isDead(option) ? "opacity-60" : "hover:border-accent transition-colors"}`}
                  >
                    <p className="font-semibold text-sm">{option.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {availability(option) ?? "Count unavailable offline"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}

        {groups.length === 0 && (
          <section className="py-20">
            <div className="container mx-auto px-4 text-center">
              <h2 className="text-2xl font-bold mb-2">No materials published yet</h2>
              <p className="text-muted-foreground">
                The catalogue has no finishes or materials on offer. Call us and we will tell you
                what is on the floor this week.
              </p>
            </div>
          </section>
        )}

        {/* Material Specs — editorial, and the only copy on this page that is not derived. */}
        <section className="py-16 bg-section-light border-t">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <div className="w-12 h-1 bg-accent mx-auto mb-5" />
              <h2 className="text-3xl font-bold mb-3">Our Material Standards</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                How the furniture is made, independent of which finish you choose
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {STANDARDS.map((standard) => (
                <div key={standard.id} className="p-6 bg-background border border-border rounded-sm hover:border-accent transition-colors">
                  <div className="w-8 h-1 bg-accent mb-4" />
                  <h3 className="font-bold text-lg mb-2">{standard.name}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">{standard.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {standard.properties.map((property) => (
                      <span key={property} className="text-xs bg-hon-green-pale text-accent px-2.5 py-1 rounded-full font-medium">
                        {property}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-14 bg-accent text-accent-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-3">Need a Custom Color?</h2>
            <p className="opacity-85 mb-7 max-w-md mx-auto">
              We offer custom fabric and finish matching for enterprise orders. Contact us with your brand guidelines.
            </p>
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground px-8" asChild>
              <Link to="/quotation">Request Custom Finish</Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Materials;
