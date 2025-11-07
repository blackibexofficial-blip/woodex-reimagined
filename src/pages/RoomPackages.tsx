import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import chairImage from "@/assets/chair-product.jpg";
import deskImage from "@/assets/desk-product.jpg";
import workstationImage from "@/assets/workstation-product.jpg";

const RoomPackages = () => {
  const packages = [
    {
      title: "Executive Office Package",
      image: deskImage,
      discount: "Save 10%",
      price: "AED 25,000",
      items: ["Executive Desk", "Ergonomic Chair", "Storage Cabinet", "Side Table"]
    },
    {
      title: "Team Workspace Package",
      image: workstationImage,
      discount: "Save 8%",
      price: "AED 45,000",
      items: ["4-Person Workstation", "Task Chairs (4)", "Storage Units", "Cable Management"]
    },
    {
      title: "Meeting Room Package",
      image: chairImage,
      discount: "Save 5%",
      price: "AED 18,000",
      items: ["Conference Table", "Meeting Chairs (8)", "Credenza", "Presentation Board"]
    },
    {
      title: "Startup Bundle",
      image: workstationImage,
      discount: "Save 7%",
      price: "AED 32,000",
      items: ["6-Person Workstation", "Chairs (6)", "Storage", "Reception Desk"]
    },
    {
      title: "Manager's Suite",
      image: deskImage,
      discount: "Save 12%",
      price: "AED 35,000",
      items: ["L-Shaped Desk", "Executive Chair", "Bookshelf", "Meeting Table"]
    },
    {
      title: "Open Office Package",
      image: chairImage,
      discount: "Save 12%",
      price: "AED 55,000",
      items: ["8-Person Benching", "Ergonomic Chairs", "Storage Lockers", "Breakout Seating"]
    }
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-primary text-primary-foreground py-16">
          <div className="container mx-auto px-4">
            <h1 className="text-4xl lg:text-6xl font-bold mb-6">Room Packages</h1>
            <p className="text-xl max-w-3xl text-primary-foreground/90">
              Complete office solutions with bundled savings. Each package includes coordinated furniture 
              pieces designed to work together seamlessly.
            </p>
          </div>
        </section>

        {/* Packages Grid */}
        <section className="py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {packages.map((pkg, index) => (
                <Card key={index} className="overflow-hidden group hover:shadow-lg transition-shadow">
                  <div className="relative aspect-square bg-muted overflow-hidden">
                    <img 
                      src={pkg.image} 
                      alt={pkg.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <Badge className="absolute top-4 left-4 bg-badge-success text-badge-success-foreground">
                      {pkg.discount}
                    </Badge>
                  </div>
                  
                  <CardContent className="pt-6">
                    <h3 className="font-semibold text-xl mb-3">{pkg.title}</h3>
                    <p className="text-2xl font-bold text-accent mb-4">{pkg.price}</p>
                    
                    <div className="space-y-2 mb-6">
                      <p className="text-sm font-medium text-muted-foreground">Package Includes:</p>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {pkg.items.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-accent mt-0.5">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <Button className="w-full">View Details</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-4">Need a Custom Package?</h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
              Our team can create a tailored solution that perfectly matches your requirements and budget
            </p>
            <Button size="lg">Contact Sales</Button>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default RoomPackages;
