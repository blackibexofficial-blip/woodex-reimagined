import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/shop/ProductCard";
import ProductListItem from "@/components/shop/ProductListItem";
import ProductFilters from "@/components/shop/ProductFilters";
import { products, getProductsByCategory, sortProducts } from "@/data/products";

const Shop = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCategory = searchParams.get("category") || "all";
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [sortBy, setSortBy] = useState("featured");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Update URL when category changes
  useEffect(() => {
    if (selectedCategory === "all") {
      searchParams.delete("category");
    } else {
      searchParams.set("category", selectedCategory);
    }
    setSearchParams(searchParams, { replace: true });
  }, [selectedCategory, searchParams, setSearchParams]);

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let result = getProductsByCategory(selectedCategory);
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (product) =>
          product.name.toLowerCase().includes(query) ||
          product.shortDescription.toLowerCase().includes(query) ||
          product.category.toLowerCase().includes(query)
      );
    }
    
    // Apply sorting
    result = sortProducts(result, sortBy);
    
    return result;
  }, [selectedCategory, searchQuery, sortBy]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">
        {/* Hero Banner */}
        <section className="bg-primary text-primary-foreground py-16">
          <div className="container mx-auto px-4">
            <h1 className="text-4xl lg:text-5xl font-bold mb-4">Shop Premium Office Furniture</h1>
            <p className="text-lg text-primary-foreground/80 max-w-2xl">
              Discover our extensive collection of ergonomic chairs, executive desks, workstations, 
              and office accessories designed for modern professionals.
            </p>
          </div>
        </section>

        {/* Shop Content */}
        <section className="py-12">
          <div className="container mx-auto px-4">
            {/* Filters */}
            <ProductFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              sortBy={sortBy}
              onSortChange={setSortBy}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              totalProducts={filteredProducts.length}
            />

            {/* Products Grid/List */}
            <div className="mt-8">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-xl text-muted-foreground mb-4">No products found</p>
                  <p className="text-muted-foreground">
                    Try adjusting your search or filter criteria
                  </p>
                </div>
              ) : viewMode === "grid" ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredProducts.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredProducts.map((product) => (
                    <ProductListItem key={product.id} product={product} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default Shop;
