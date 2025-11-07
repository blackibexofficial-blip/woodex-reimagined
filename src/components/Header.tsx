import { Link } from "react-router-dom";
import { Search, ShoppingCart, User, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

const Header = () => {
  return (
    <header className="w-full border-b bg-background sticky top-0 z-50">
      {/* Utility Bar */}
      <div className="bg-utility-bar border-b">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-10 text-sm">
            <div className="flex items-center gap-6 text-utility-text">
              <Link to="/showrooms" className="hover:text-foreground transition-colors">
                Showrooms
              </Link>
              <span className="text-border">|</span>
              <Link to="/materials" className="hover:text-foreground transition-colors">
                Material and Colors
              </Link>
              <span className="text-border">|</span>
              <Link to="/warranty" className="hover:text-foreground transition-colors">
                Warranty
              </Link>
            </div>
            <div className="flex items-center gap-4 text-utility-text">
              <span>English</span>
              <span className="text-border">|</span>
              <span>AED</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <div className="bg-background">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <Link to="/" className="text-2xl font-bold tracking-tight">
              WOODEX
            </Link>

            {/* Navigation */}
            <nav className="hidden lg:flex items-center gap-8">
              <Link to="/" className="text-sm hover:text-muted-foreground transition-colors">
                Home
              </Link>
              <Link to="/shop" className="text-sm hover:text-muted-foreground transition-colors">
                Shop
              </Link>
              <Link to="/room-packages" className="text-sm hover:text-muted-foreground transition-colors">
                Room Packages
              </Link>
              <Link to="/virtual-showroom" className="text-sm hover:text-muted-foreground transition-colors">
                Virtual Showroom
              </Link>
              <Link to="/series" className="text-sm hover:text-muted-foreground transition-colors">
                Series
              </Link>
              <Link to="/projects" className="text-sm hover:text-muted-foreground transition-colors">
                Projects
              </Link>
              <Link to="/services" className="text-sm hover:text-muted-foreground transition-colors">
                Services
              </Link>
              <Link to="/b2b" className="text-sm hover:text-muted-foreground transition-colors">
                B2B
              </Link>
              <Link to="/about" className="text-sm hover:text-muted-foreground transition-colors">
                About
              </Link>
              <Link to="/contact" className="text-sm hover:text-muted-foreground transition-colors">
                Contact
              </Link>
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon">
                <Search className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="sm" className="gap-2">
                <User className="h-5 w-5" />
                <span className="hidden sm:inline">Sign in</span>
              </Button>
              <Button variant="ghost" size="icon">
                <ShoppingCart className="h-5 w-5" />
              </Button>
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <Link to="/quotation">
                  <FileText className="h-4 w-4" />
                  E-Quotation
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
