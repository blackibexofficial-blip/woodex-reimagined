import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Phone, Clock, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import showroomImg from "@/assets/virtual-showroom-hero.webp";
import { site } from "@/config/site";
import { getAdminApi } from "@/api";
import type { AdminShowroom } from "@/api/types";

const Showrooms = () => {
  const [rooms, setRooms] = useState<AdminShowroom[] | null>(null); // null = loading
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    document.title = "Showroom Locations — WOODEX Pakistan";
  }, []);

  useEffect(() => {
    let live = true;
    getAdminApi().listShowrooms()
      .then((rs) => {
        if (!live) return;
        setRooms(
          rs
            .filter((r) => r.active)
            .sort((a, b) => Number(b.isHQ) - Number(a.isHQ) || a.sortOrder - b.sortOrder),
        );
      })
      .catch((e) => {
        console.warn("[woodex] showrooms unavailable", e);
        if (live) { setLoadError(true); setRooms([]); }
      });
    return () => { live = false; };
  }, []);

  const count = rooms?.length ?? 0;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative h-64 overflow-hidden bg-primary">
          <img src={showroomImg} alt="WOODEX Showrooms" className="absolute inset-0 w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 flex items-center">
            <div className="container mx-auto px-4">
              <p className="text-accent text-xs font-bold uppercase tracking-widest mb-2">Experience In Person</p>
              <h1 className="text-4xl lg:text-5xl font-black text-primary-foreground">Visit Our Showrooms</h1>
              <p className="text-primary-foreground/70 mt-3 max-w-xl">
                Explore our complete furniture collection in person{rooms === null ? " across Pakistan" : count > 0 ? ` at ${count} ${count === 1 ? "location" : "locations"} across Pakistan` : " — flagship in Lahore"}.
              </p>
            </div>
          </div>
        </section>

        {/* Showrooms Grid */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            {rooms === null ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="p-6 border rounded-sm animate-pulse space-y-3">
                    <div className="h-4 w-1/3 bg-muted rounded" />
                    <div className="h-6 w-2/3 bg-muted rounded" />
                    <div className="h-4 w-full bg-muted rounded" />
                    <div className="h-4 w-3/4 bg-muted rounded" />
                    <div className="h-9 w-full bg-muted rounded" />
                  </div>
                ))}
              </div>
            ) : rooms.length === 0 ? (
              <div className="max-w-xl mx-auto text-center py-8">
                <h2 className="text-2xl font-bold mb-2">Visit us in Lahore</h2>
                <p className="text-muted-foreground mb-5">
                  {loadError
                    ? "Showroom details couldn't be loaded right now — call or message us and we'll sort out your visit."
                    : "Our showroom list is being updated — call or message us and we'll route you to the nearest team."}
                </p>
                <p className="font-semibold text-foreground">{site.address.oneLine}</p>
                <p className="text-lg font-bold text-accent mt-2">{site.phoneAlt}</p>
                <Button asChild className="mt-6 bg-accent hover:bg-hon-green-dark text-accent-foreground">
                  <Link to="/contact">Contact Us</Link>
                </Button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {rooms.map((s) => (
                  <div
                    key={s.id}
                    className={`p-6 border rounded-sm hover:border-accent transition-all hover:shadow-lg ${s.isHQ ? "border-accent bg-hon-green-pale" : "border-border bg-background"}`}
                  >
                    {s.isHQ && (
                      <span className="text-xs font-bold uppercase tracking-widest text-accent mb-3 block">Headquarters</span>
                    )}
                    <div className="w-10 h-1 bg-accent mb-4" />
                    <h2 className="font-bold text-xl mb-4">{s.city}</h2>
                    <div className="space-y-3 text-sm text-muted-foreground mb-5">
                      <div className="flex items-start gap-2.5">
                        <MapPin className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                        <span>{s.address}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Phone className="h-4 w-4 text-accent flex-shrink-0" />
                        <a href={`tel:${s.phone.replace(/[^+\d]/g, "")}`} className="hover:text-accent transition-colors">{s.phone}</a>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Clock className="h-4 w-4 text-accent flex-shrink-0" />
                        <span>{s.hours}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {s.whatsapp && (
                        <Button
                          size="sm"
                          className="flex-1 bg-accent hover:bg-hon-green-dark text-accent-foreground"
                          onClick={() => window.open(`https://wa.me/${s.whatsapp}`, "_blank", "noopener,noreferrer")}
                        >
                          WhatsApp
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-accent text-accent hover:bg-accent hover:text-accent-foreground"
                        onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(s.address)}`, "_blank", "noopener,noreferrer")}
                      >
                        <Navigation className="h-3.5 w-3.5 mr-1.5" />
                        Directions
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Book a Visit CTA */}
        <section className="py-14 bg-section-light border-t">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-2xl font-bold mb-3">Plan Your Visit</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">Our design consultants are available for one-on-one sessions. Book a slot and we'll prepare a space for you.</p>
            <Button className="bg-accent hover:bg-hon-green-dark text-accent-foreground" asChild>
              <Link to="/contact">Book an Appointment</Link>
            </Button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Showrooms;
