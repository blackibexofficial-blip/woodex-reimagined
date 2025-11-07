import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Package, Lightbulb, TrendingUp } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import heroImage from "@/assets/hero-office.jpg";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative h-[600px] lg:h-[700px] flex items-center justify-center overflow-hidden">
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImage})` }}
          >
            <div className="absolute inset-0 bg-hero-overlay/70"></div>
          </div>
          
          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-3xl text-primary-foreground">
              <h1 className="text-5xl lg:text-7xl font-bold mb-6 leading-tight">
                Work Your Way
              </h1>
              <p className="text-xl lg:text-2xl mb-8 text-primary-foreground/90 leading-relaxed">
                Modern office furniture designed for productivity and comfort
              </p>
              <p className="text-lg mb-8 text-primary-foreground/80 max-w-2xl leading-relaxed">
                Discover our comprehensive range of premium office furniture including ergonomic chairs, 
                executive desks, workstations, and complete workspace solutions.
              </p>
              <div className="flex flex-wrap gap-4">
                <Button size="lg" className="bg-primary-foreground text-primary hover:bg-primary-foreground/90" asChild>
                  <Link to="/shop">Explore Collection</Link>
                </Button>
                <Button size="lg" variant="outline" className="bg-transparent border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary" asChild>
                  <Link to="/quotation">Get Quote</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold mb-4">Why Choose WOODEX</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Experience excellence in office furniture manufacturing with our commitment to quality and innovation
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="bg-accent/10 w-14 h-14 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 className="h-7 w-7 text-accent" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">Premium Quality</h3>
                  <p className="text-sm text-muted-foreground">
                    Exceptional craftsmanship and materials ensuring long-lasting durability
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="bg-accent/10 w-14 h-14 rounded-full flex items-center justify-center mb-4">
                    <Package className="h-7 w-7 text-accent" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">Custom Solutions</h3>
                  <p className="text-sm text-muted-foreground">
                    Tailored designs to match your brand identity and space requirements
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="bg-accent/10 w-14 h-14 rounded-full flex items-center justify-center mb-4">
                    <Lightbulb className="h-7 w-7 text-accent" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">Expert Consultation</h3>
                  <p className="text-sm text-muted-foreground">
                    Professional space planning and ergonomic assessments
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="bg-accent/10 w-14 h-14 rounded-full flex items-center justify-center mb-4">
                    <TrendingUp className="h-7 w-7 text-accent" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">Competitive Pricing</h3>
                  <p className="text-sm text-muted-foreground">
                    Transparent pricing with no hidden fees and flexible payment options
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Categories Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold mb-4">Explore Our Collections</h2>
              <p className="text-muted-foreground text-lg">
                Premium office furniture designed for modern workspaces
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              <Link to="/shop?category=chairs" className="group">
                <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="aspect-square bg-muted"></div>
                  <CardContent className="pt-4">
                    <h3 className="font-semibold text-xl group-hover:text-accent transition-colors">
                      Ergonomic Chairs
                    </h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      Comfort and support for long working hours
                    </p>
                  </CardContent>
                </Card>
              </Link>
              
              <Link to="/shop?category=desks" className="group">
                <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="aspect-square bg-muted"></div>
                  <CardContent className="pt-4">
                    <h3 className="font-semibold text-xl group-hover:text-accent transition-colors">
                      Executive Desks
                    </h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      Sophisticated designs for leadership spaces
                    </p>
                  </CardContent>
                </Card>
              </Link>
              
              <Link to="/shop?category=workstations" className="group">
                <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="aspect-square bg-muted"></div>
                  <CardContent className="pt-4">
                    <h3 className="font-semibold text-xl group-hover:text-accent transition-colors">
                      Workstations
                    </h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      Collaborative spaces for team productivity
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Ready to Transform Your Workspace?</h2>
            <p className="text-lg text-primary-foreground/90 mb-8 max-w-2xl mx-auto">
              Get in touch with our experts for a free consultation and discover how WOODEX can elevate your office environment
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Button size="lg" variant="secondary" asChild>
                <Link to="/quotation">Request Quote</Link>
              </Button>
              <Button size="lg" variant="outline" className="bg-transparent border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary" asChild>
                <Link to="/virtual-showroom">Virtual Showroom</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default Index;
