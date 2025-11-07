import { Play, Armchair, Users, BarChart3, Box, Sofa } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const VirtualShowroom = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-primary text-primary-foreground py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl">
              <h1 className="text-4xl lg:text-6xl font-bold mb-6">Virtual Showroom</h1>
              <p className="text-xl mb-8 text-primary-foreground/90">
                Experience our furniture in immersive 3D. Design your perfect office space with real-time visualization.
              </p>
              <div className="flex flex-wrap gap-4">
                <Button size="lg" variant="secondary">
                  Launch 3D Configurator
                </Button>
                <Button size="lg" variant="outline" className="bg-transparent border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary">
                  <Play className="mr-2 h-5 w-5" />
                  Watch Demo
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Room Types */}
        <section className="py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="flex justify-end mb-8">
              <div className="flex gap-2">
                <Button variant="outline" size="sm">All Rooms</Button>
                <Button variant="outline" size="sm">Private Office</Button>
                <Button variant="outline" size="sm">Open Plan</Button>
              </div>
            </div>
          </div>
        </section>

        {/* Product Categories */}
        <section className="py-8 bg-muted/30">
          <div className="container mx-auto px-4">
            <Card className="p-6">
              <div className="flex flex-wrap gap-4 justify-center">
                {[
                  { icon: Armchair, label: "Executive Chairs" },
                  { icon: Users, label: "Workstations" },
                  { icon: BarChart3, label: "Standing Desks" },
                  { icon: Box, label: "Storage" },
                  { icon: Sofa, label: "Lounge" }
                ].map((category, index) => (
                  <Button key={index} variant="outline" className="flex items-center gap-2">
                    <category.icon className="h-4 w-4" />
                    <span>{category.label}</span>
                  </Button>
                ))}
              </div>
            </Card>
          </div>
        </section>

        {/* 3D Configurator Placeholder */}
        <section className="py-16 bg-background">
          <div className="container mx-auto px-4">
            <Card className="bg-muted/50 h-[500px] flex items-center justify-center">
              <div className="text-center">
                <div className="w-24 h-24 bg-background rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                  <Box className="h-12 w-12 text-muted-foreground" />
                </div>
                <h3 className="text-2xl font-bold mb-4">3D Configurator</h3>
                <p className="text-muted-foreground mb-6 max-w-md">
                  Interactive 3D room visualization will load here
                </p>
                <Button size="lg">
                  Launch Configurator
                </Button>
              </div>
            </Card>
          </div>
        </section>

        {/* Features */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold mb-4">Virtual Showroom Features</h2>
              <p className="text-muted-foreground text-lg">Experience furniture shopping like never before</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  title: "Real-Time 3D Preview",
                  description: "See products from every angle with photorealistic rendering"
                },
                {
                  title: "Space Planning",
                  description: "Design your office layout with accurate dimensions"
                },
                {
                  title: "Color Customization",
                  description: "Try different materials and finishes instantly"
                }
              ].map((feature, index) => (
                <Card key={index}>
                  <div className="p-6">
                    <h3 className="font-semibold text-xl mb-3">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default VirtualShowroom;
