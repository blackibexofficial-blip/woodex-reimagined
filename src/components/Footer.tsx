import { Link } from "react-router-dom";
import { Phone, Mail, MapPin, Facebook, Twitter, Linkedin, Instagram, Youtube } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-primary text-primary-foreground mt-auto">
      {/* Main Footer */}
      <div className="container mx-auto px-4 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="mb-4">
              <span className="text-2xl font-black tracking-tight">WOODEX</span>
              <p className="text-xs text-primary-foreground/50 font-normal mt-0.5">Make your space work®</p>
            </div>
            <p className="text-sm text-primary-foreground/70 leading-relaxed max-w-xs mb-6">
              Pakistan's premium office furniture manufacturer delivering exceptional design-to-delivery
              solutions for modern workspaces. Committed to innovation, quality, and customer satisfaction.
            </p>
            <div className="space-y-2.5 text-sm text-primary-foreground/70">
              <div className="flex items-center gap-2.5">
                <Phone className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                <span>+92 300 1234567</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                <span>info@woodex.pk</span>
              </div>
              <div className="flex items-center gap-2.5">
                <MapPin className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                <span>Lahore, Pakistan</span>
              </div>
            </div>
            {/* Social */}
            <div className="flex items-center gap-3 mt-6">
              {[Facebook, Twitter, Linkedin, Instagram, Youtube].map((Icon, i) => (
                <button
                  key={i}
                  className="w-8 h-8 rounded-full border border-primary-foreground/20 flex items-center justify-center hover:border-accent hover:text-accent transition-colors"
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-sm mb-4 text-primary-foreground uppercase tracking-wider">Quick Links</h4>
            <ul className="space-y-2.5 text-sm">
              {[
                { label: "About Us", href: "/about" },
                { label: "Portfolio", href: "/projects" },
                { label: "Careers", href: "/contact" },
                { label: "Contact", href: "/contact" },
                { label: "Showrooms", href: "/contact" },
              ].map((link) => (
                <li key={link.label}>
                  <Link to={link.href} className="text-primary-foreground/70 hover:text-accent transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Shop */}
          <div>
            <h4 className="font-semibold text-sm mb-4 text-primary-foreground uppercase tracking-wider">Shop</h4>
            <ul className="space-y-2.5 text-sm">
              {[
                { label: "Ergonomic Chairs", href: "/shop?category=chairs" },
                { label: "Executive Desks", href: "/shop?category=desks" },
                { label: "Workstations", href: "/shop?category=workstations" },
                { label: "Meeting Tables", href: "/shop?category=tables" },
                { label: "Office Storage", href: "/shop?category=storage" },
                { label: "Room Packages", href: "/room-packages" },
              ].map((link) => (
                <li key={link.label}>
                  <Link to={link.href} className="text-primary-foreground/70 hover:text-accent transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Learn More */}
          <div>
            <h4 className="font-semibold text-sm mb-4 text-primary-foreground uppercase tracking-wider">Learn More</h4>
            <ul className="space-y-2.5 text-sm">
              {[
                { label: "Awards", href: "/about" },
                { label: "Ideas & Inspiration", href: "/projects" },
                { label: "Terms of Use", href: "/contact" },
                { label: "Resources", href: "/services" },
                { label: "Support", href: "/contact" },
                { label: "Warranty", href: "/contact" },
                { label: "Distributors", href: "/b2b" },
              ].map((link) => (
                <li key={link.label}>
                  <Link to={link.href} className="text-primary-foreground/70 hover:text-accent transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-primary-foreground/10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-primary-foreground/50">
            <p>&copy; {new Date().getFullYear()} WOODEX. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <Link to="/contact" className="hover:text-accent transition-colors">Privacy Policy</Link>
              <Link to="/contact" className="hover:text-accent transition-colors">Terms of Service</Link>
              <Link to="/contact" className="hover:text-accent transition-colors">Sitemap</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
