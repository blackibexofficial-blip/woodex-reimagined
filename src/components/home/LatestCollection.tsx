import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useCatalogProducts } from "@/hooks/useCatalog";
import { formatPKR } from "@/data/products";
import type { Product } from "@/lib/api/types";

/**
 * Four products from the catalogue, not four products from a file.
 *
 * The list that used to live here named four pieces and pointed each one at a slug. Three of
 * those slugs existed nowhere — not in the database, not even in the bundled snapshot — so the
 * most visited page on the site offered three links to a product page that would tell the
 * visitor it had been withdrawn. Featured products come first, then the rest of the catalogue
 * fills the row, which is also what a merchandiser would expect "Latest Collection" to mean.
 */

const SHOWN = 4;

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function label(product: Product): string {
  return titleCase(product.subcategory ?? product.category);
}

function choose(products: Product[]): Product[] {
  const featured = products.filter((product) => product.isBestSeller);

  return [...featured, ...products.filter((product) => !product.isBestSeller)].slice(0, SHOWN);
}

const LatestCollection = () => {
  const { products } = useCatalogProducts();
  const shown = choose(products);

  if (shown.length === 0) return null;

  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="text-3xl lg:text-4xl font-bold mb-2">Latest Collection</h2>
            <p className="text-muted-foreground">Handpicked premium furniture for the modern workspace</p>
          </div>
          <Button variant="outline" className="hidden md:flex border-accent text-accent hover:bg-accent hover:text-accent-foreground" asChild>
            <Link to="/shop">View All <ArrowRight className="h-4 w-4 ml-2" /></Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {shown.map((product) => (
            <Link key={product.id} to={`/product/${product.id}`} className="group border border-border rounded-sm overflow-hidden bg-background hover:border-accent hover:shadow-lg transition-all">
              <div className="aspect-square bg-muted overflow-hidden">
                {product.images[0] ? (
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full bg-secondary" aria-hidden />
                )}
              </div>
              <div className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">{label(product)}</p>
                <h3 className="font-bold text-sm group-hover:text-accent transition-colors">{product.name}</h3>
                <p className="text-sm font-bold text-accent mt-1">{formatPKR(product.price)}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LatestCollection;
