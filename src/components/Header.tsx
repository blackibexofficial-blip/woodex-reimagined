import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Search, User, FileText, Menu, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const Header = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const location = useLocation();

  const navItems = [
    {
      label: "Products",
      href: "/shop",
      dropdown: [
        { label: "Ergonomic Chairs", href: "/shop?category=chairs" },
        { label: "Executive Desks", href: "/shop?category=desks" },
        { label: "Workstations", href: "/shop?category=workstations" },
        { label: "Meeting Tables", href: "/shop?category=tables" },
        { label: "Office Storage", href: "/shop?category=storage" },
      ]
    },
    { label: "Markets", href: "/b2b",
      dropdown: [
        { label: "Corporate Business", href: "/b2b" },
        { label: "Education", href: "/b2b" },
        { label: "Healthcare", href: "/b2b" },
        { label: "Government", href: "/b2b" },
        { label: "Hospitality", href: "/b2b" },
      ]
    },
    { label: "Series", href: "/series" },
    { label: "Room Packages", href: "/room-packages" },
    { label: "Virtual Showroom", href: "/virtual-showroom" },
    { label: "Projects", href: "/projects" },
    { label: "Services", href: "/services" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ];

  const isActive = (href: string) => location.pathname === href || location.pathname.startsWith(href + "?");

  return (
    <header className="w-full sticky top-0 z-50 shadow-sm">
      {/* Utility Bar — HON style dark bar */}
      <div className="bg-utility-bar">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-9 text-xs">
            <div className="flex items-center gap-5 text-utility-text">
              <Link to="/contact" className="hover:text-white transition-colors">
                Showrooms
              </Link>
              <span className="text-utility-text/30">|</span>
              <Link to="/contact" className="hover:text-white transition-colors">
                Material and Colors
              </Link>
              <span className="text-utility-text/30">|</span>
              <Link to="/contact" className="hover:text-white transition-colors">
                Warranty
              </Link>
            </div>
            <div className="flex items-center gap-4 text-utility-text">
              <span className="hover:text-white cursor-pointer transition-colors">English</span>
              <span className="text-utility-text/30">|</span>
              <span className="hover:text-white cursor-pointer transition-colors">PKR</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="bg-background border-b">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 flex-shrink-0">
              <div className="flex items-center gap-1">
                <span className="text-2xl font-black tracking-tight text-primary">WOODEX</span>
                <span className="hidden sm:block text-xs text-muted-foreground font-normal ml-2 border-l pl-2 border-border leading-tight">
                  Make your<br />space work
                </span>
              </div>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden xl:flex items-center gap-1">
              {navItems.map((item) => (
                <div
                  key={item.label}
                  className="relative"
                  onMouseEnter={() => item.dropdown && setActiveDropdown(item.label)}
                  onMouseLeave={() => setActiveDropdown(null)}
                >
                  <Link
                    to={item.href}
                    className={`flex items-center gap-0.5 px-3 py-2 text-sm font-medium transition-colors rounded-sm ${
                      isActive(item.href)
                        ? "text-accent"
                        : "text-foreground hover:text-accent"
                    }`}
                  >
                    {item.label}
                    {item.dropdown && <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />}
                  </Link>

                  {/* Dropdown */}
                  {item.dropdown && activeDropdown === item.label && (
                    <div className="absolute top-full left-0 w-52 bg-background border shadow-lg rounded-sm z-50 py-1">
                      {item.dropdown.map((sub) => (
                        <Link
                          key={sub.label}
                          to={sub.href}
                          className="block px-4 py-2.5 text-sm text-foreground hover:bg-hon-green-pale hover:text-accent transition-colors"
                        >
                          {sub.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="text-foreground hover:text-accent">
                <Search className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="text-foreground hover:text-accent">
                <User className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                className="hidden sm:flex bg-accent text-accent-foreground hover:bg-hon-green-dark gap-1.5 text-xs font-semibold px-4"
                asChild
              >
                <Link to="/quotation">
                  <FileText className="h-3.5 w-3.5" />
                  E-Quotation
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="xl:hidden"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="xl:hidden bg-background border-b shadow-lg">
          <div className="container mx-auto px-4 py-4 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.label}
                to={item.href}
                onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2.5 text-sm font-medium rounded-sm transition-colors ${
                  isActive(item.href)
                    ? "text-accent bg-hon-green-pale"
                    : "text-foreground hover:text-accent hover:bg-muted"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <div className="pt-3 border-t">
              <Button size="sm" className="w-full bg-accent text-accent-foreground hover:bg-hon-green-dark" asChild>
                <Link to="/quotation" onClick={() => setMobileOpen(false)}>
                  <FileText className="h-4 w-4 mr-2" />
                  E-Quotation
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
