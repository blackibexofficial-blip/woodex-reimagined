import { Building2, Users, TrendingUp, HeadphonesIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const B2B = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">
        <section className="bg-primary text-primary-foreground py-20">
          <div className="container mx-auto px-4">
            <h1 className="text-4xl lg:text-6xl font-bold mb-6">B2B Solutions</h1>
            <p className="text-xl max-w-3xl text-primary-foreground/90">
              Partner with WOODEX for enterprise furniture solutions. Volume pricing, dedicated support, 
              and flexible terms for businesses of all sizes.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { icon: Building2, title: "Corporate Solutions", description: "Large-scale office furnishing projects" },
                { icon: Users, title: "Dealer Program", description: "Become an authorized WOODEX dealer" },
                { icon: TrendingUp, title: "Volume Pricing", description: "Competitive rates for bulk orders" },
                { icon: HeadphonesIcon, title: "Dedicated Support", description: "Account manager and priority service" }
              ].map((item, index) => (
                <Card key={index}>
                  <CardContent className="pt-6">
                    <div className="bg-accent/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                      <item.icon className="h-6 w-6 text-accent" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            <div className="text-center mt-12">
              <Button size="lg">Request B2B Catalog</Button>
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default B2B;
