import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="bg-primary text-primary-foreground mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Company Info */}
          <div>
            <h3 className="text-xl font-bold mb-4">WOODEX</h3>
            <p className="text-sm text-primary-foreground/80 leading-relaxed">
              Pakistan's premium office furniture manufacturer delivering exceptional design-to-delivery
              solutions for modern workspaces. Committed to innovation, quality, and customer satisfaction.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/about" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/projects" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Portfolio
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Careers
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Shop */}
          <div>
            <h4 className="font-semibold mb-4">Shop</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/shop?category=chairs" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Ergonomic Chairs
                </Link>
              </li>
              <li>
                <Link to="/shop?category=desks" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Executive Desks
                </Link>
              </li>
              <li>
                <Link to="/shop?category=workstations" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Workstations
                </Link>
              </li>
              <li>
                <Link to="/shop?category=tables" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Meeting Tables
                </Link>
              </li>
              <li>
                <Link to="/shop?category=storage" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Office Storage
                </Link>
              </li>
            </ul>
          </div>

          {/* Learn More */}
          <div>
            <h4 className="font-semibold mb-4">Learn More</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/about" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Awards
                </Link>
              </li>
              <li>
                <Link to="/projects" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Ideas
                </Link>
              </li>
              <li>
                <Link to="/warranty" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Terms
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Resources
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Support
                </Link>
              </li>
              <li>
                <Link to="/warranty" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Warranty
                </Link>
              </li>
              <li>
                <Link to="/showrooms" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                  Distributors
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-primary-foreground/20 mt-8 pt-8 text-center text-sm text-primary-foreground/60">
          <p>&copy; {new Date().getFullYear()} WOODEX. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
