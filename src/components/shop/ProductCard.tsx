import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, ShoppingCart, Eye } from "lucide-react";
import { Product } from "@/data/products";

interface ProductCardProps {
  product: Product;
}

const ProductCard = ({ product }: ProductCardProps) => {
  const discount = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  return (
    <Card className="group overflow-hidden hover:shadow-xl transition-all duration-300">
      <div className="relative aspect-square overflow-hidden bg-muted">
        <img
          src={product.images[0]}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        
        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {product.isNew && (
            <Badge className="bg-accent text-accent-foreground">New</Badge>
          )}
          {product.isBestSeller && (
            <Badge variant="secondary">Best Seller</Badge>
          )}
          {discount > 0 && (
            <Badge variant="destructive">-{discount}%</Badge>
          )}
          {!product.inStock && (
            <Badge variant="outline" className="bg-background">Out of Stock</Badge>
          )}
        </div>

        {/* Quick Actions Overlay */}
        <div className="absolute inset-0 bg-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3">
          <Button size="icon" variant="secondary" className="rounded-full" asChild>
            <Link to={`/shop/${product.id}`}>
              <Eye className="h-5 w-5" />
            </Link>
          </Button>
          <Button size="icon" className="rounded-full" disabled={!product.inStock}>
            <ShoppingCart className="h-5 w-5" />
          </Button>
        </div>

        {/* Color Swatches Preview */}
        <div className="absolute bottom-3 left-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          {product.colors.slice(0, 4).map((color, index) => (
            <div
              key={index}
              className="w-5 h-5 rounded-full border-2 border-background shadow-sm"
              style={{ backgroundColor: color.hex }}
              title={color.name}
            />
          ))}
          {product.colors.length > 4 && (
            <div className="w-5 h-5 rounded-full bg-background border-2 border-border flex items-center justify-center text-xs">
              +{product.colors.length - 4}
            </div>
          )}
        </div>
      </div>

      <CardContent className="p-4">
        {/* Rating */}
        <div className="flex items-center gap-1 mb-2">
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          <span className="text-sm font-medium">{product.rating}</span>
          <span className="text-sm text-muted-foreground">({product.reviews})</span>
        </div>

        {/* Product Name */}
        <Link to={`/shop/${product.id}`}>
          <h3 className="font-semibold text-lg mb-1 group-hover:text-accent transition-colors line-clamp-2">
            {product.name}
          </h3>
        </Link>

        {/* Short Description */}
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
          {product.shortDescription}
        </p>

        {/* Price */}
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold">AED {product.price.toLocaleString()}</span>
          {product.originalPrice && (
            <span className="text-sm text-muted-foreground line-through">
              AED {product.originalPrice.toLocaleString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ProductCard;
