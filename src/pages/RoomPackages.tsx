import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getAdminApi } from "@/api";
import type { AdminBundle } from "@/api/types";
import { bundleMath, bundleUnitCount } from "@/lib/bundles";
import { bundleImage } from "@/lib/bundleImages";
import { products, formatPKR } from "@/data/products";

const productById = new Map(products.map((p) => [p.id, p]));

const RoomPackages = () => {
  const [bundles, setBundles] = useState<AdminBundle[] | null>(null); // null = loading
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    document.title = "Room Packages — WOODEX Pakistan | Bundled Office Furniture Solutions";
  }, []);

  useEffect(() => {
    let live = true;
    getAdminApi().listBundles()
      .then((rows) => {
        if (!live) return;
        setBundles(
          rows
            .filter((b) => b.status === "active")
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
        );
      })
      .catch((e) => {
        console.warn("[woodex] bundles unavailable", e);
        if (live) { setLoadError(true); setBundles([]); }
      });
    return () => { live = false; };
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-primary text-primary-foreground py-14">
          <div className="container mx-auto px-4">
            <p className="text-accent text-xs font-bold uppercase tracking-widest mb-2">Bundled Solutions</p>
            <h1 className="text-4xl lg:text-5xl font-black mb-3">Room Packages</h1>
            <p className="text-primary-foreground/75 max-w-xl">
              Complete office solutions with bundled savings. Each package includes coordinated furniture
              pieces designed to work together seamlessly.
            </p>
          </div>
        </section>

        {/* Why Packages Bar */}
        <section className="bg-accent py-5">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap justify-center gap-8 text-accent-foreground text-sm font-medium">
              {["Coordinated Design", "Significant Savings", "Fast Delivery", "Easy Installation", "Full Warranty"].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Packages Grid — driven live off the admin-managed bundles */}
        <section className="py-16 bg-background">
          <div className="container mx-auto px-4">
            {bundles === null ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-7" aria-busy="true" aria-live="polite">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="border-2 border-border rounded-sm overflow-hidden animate-pulse">
                    <div className="aspect-[4/3] bg-muted" />
                    <div className="p-6 space-y-3">
                      <div className="h-5 w-3/4 bg-muted rounded" />
                      <div className="h-4 w-full bg-muted rounded" />
                      <div className="h-7 w-1/3 bg-muted rounded" />
                      <div className="h-24 w-full bg-muted rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : bundles.length === 0 ? (
              <div className="max-w-xl mx-auto text-center py-10">
                <h2 className="text-2xl font-bold mb-2">Packages are being curated</h2>
                <p className="text-muted-foreground mb-6">
                  {loadError
                    ? "Our catalogue bundles couldn't be loaded right now — the team can put a custom package together for you meanwhile."
                    : "Our merchandising team is putting together the next set of packages — or request a custom one now."}
                </p>
                <Button className="bg-accent hover:bg-hon-green-dark text-accent-foreground" asChild>
                  <Link to="/quotation">Request Custom Quote <ArrowRight className="h-4 w-4 ml-2" /></Link>
                </Button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-7">
                {bundles.map((bundle) => {
                  const m = bundleMath(bundle, (id) => productById.get(id));
                  const units = bundleUnitCount(bundle);
                  const lines = bundle.lines
                    .map((l) => ({ line: l, product: productById.get(l.productId) }))
                    .filter((x) => x.product);
                  return (
                    <div
                      key={bundle.id}
                      className={`group border-2 rounded-sm overflow-hidden hover:shadow-xl transition-all flex flex-col ${
                        bundle.popular ? "border-accent" : "border-border hover:border-accent"
                      }`}
                    >
                      {bundle.popular && (
                        <div className="bg-accent text-accent-foreground text-xs font-bold py-2 text-center uppercase tracking-wider">
                          ⭐ Most Popular Choice
                        </div>
                      )}
                      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                        <img
                          src={bundleImage(bundle.image)}
                          alt={bundle.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute top-3 left-3">
                          <Badge className="bg-accent text-accent-foreground text-xs">Save {bundle.discountPct}%</Badge>
                        </div>
                      </div>

                      <div className="p-6 flex flex-col flex-1">
                        <h3 className="font-bold text-xl mb-2 group-hover:text-accent transition-colors">{bundle.name}</h3>
                        {bundle.description && <p className="text-sm text-muted-foreground mb-4">{bundle.description}</p>}

                        <div className="flex flex-wrap items-baseline gap-3 mb-1">
                          <span className="text-2xl font-black text-accent">{formatPKR(m.price)}</span>
                          {m.retail > m.price && (
                            <span className="text-sm text-muted-foreground line-through">{formatPKR(m.retail)}</span>
                          )}
                        </div>
                        <p className="text-[11px] font-semibold text-hon-green-dark mb-5">You save {formatPKR(m.save)} vs buying separately</p>

                        <div className="space-y-2 mb-6 border-t pt-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Includes {units} items:</p>
                          {lines.map(({ line, product }) => (
                            <div key={line.productId} className="flex items-center gap-2 text-sm text-muted-foreground">
                              <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                              <Link to={`/shop/${product!.id}`} className="hover:text-accent hover:underline transition-colors">
                                {product!.name}{line.quantity > 1 ? ` ×${line.quantity}` : ""}
                              </Link>
                            </div>
                          ))}
                        </div>

                        <div className="mt-auto">
                          <Button className="w-full bg-accent hover:bg-hon-green-dark text-accent-foreground" asChild>
                            <Link to="/quotation">
                              Get Quote <ArrowRight className="h-4 w-4 ml-2" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Custom Package CTA */}
        <section className="py-16 bg-section-light border-t">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center">
              <div className="w-12 h-1 bg-accent mx-auto mb-5" />
              <h2 className="text-3xl font-bold mb-3">Need a Custom Package?</h2>
              <p className="text-muted-foreground text-lg mb-7">
                Our team can create a tailored solution that perfectly matches your requirements and budget.
                Just tell us what you need.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <Button size="lg" className="bg-accent hover:bg-hon-green-dark text-accent-foreground px-8" asChild>
                  <Link to="/quotation">Request Custom Quote</Link>
                </Button>
                <Button size="lg" variant="outline" className="border-accent text-accent hover:bg-accent hover:text-accent-foreground" asChild>
                  <Link to="/contact">Contact Sales</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default RoomPackages;
