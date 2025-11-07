import { Lightbulb, Package, Truck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Services = () => {
  const services = [
    {
      icon: Lightbulb,
      title: "Space Planning",
      description: "Transform your office with expert space planning. Our design consultants analyze your workflow, team size, and growth plans to create optimal workspace layouts.",
      features: [
        "On-site consultation",
        "CAD floor plans",
        "Ergonomic assessments",
        "3D visualization",
        "Space optimization"
      ]
    },
    {
      icon: Package,
      title: "Custom Design",
      description: "Bring your vision to life with our custom design service. We create bespoke furniture tailored to your exact specifications, brand identity, and space requirements.",
      features: [
        "Custom dimensions",
        "Material selection",
        "Color matching",
        "Logo integration",
        "Brand consistency"
      ]
    },
    {
      icon: Truck,
      title: "Delivery & Installation",
      description: "Professional delivery and installation services ensure your furniture is set up correctly and ready to use. Our expert team handles everything from transportation to assembly.",
      features: [
        "Nationwide delivery",
        "Professional assembly",
        "Debris removal",
        "Quality inspection",
        "Warranty activation"
      ]
    }
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-background py-16 lg:py-24">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 bg-muted px-4 py-2 rounded-full mb-6">
                <span className="text-2xl">📋</span>
                <span className="text-sm font-medium text-muted-foreground">NEW SERVICE</span>
              </div>
              <h1 className="text-4xl lg:text-6xl font-bold mb-6">Our Services</h1>
              <p className="text-lg text-muted-foreground">
                Comprehensive office furniture solutions from design to delivery. We provide end-to-end
                services to ensure your workspace meets your exact needs.
              </p>
            </div>
          </div>
        </section>

        {/* Services Grid */}
        <section className="py-16 lg:py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-3 gap-8">
              {services.map((service, index) => (
                <Card key={index} className="bg-background">
                  <CardContent className="pt-8">
                    <div className="bg-muted w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                      <service.icon className="h-8 w-8 text-foreground" />
                    </div>
                    
                    <h2 className="text-2xl font-bold mb-4">{service.title}</h2>
                    
                    <p className="text-muted-foreground mb-6 leading-relaxed">
                      {service.description}
                    </p>
                    
                    <ul className="space-y-3">
                      {service.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <span className="text-accent mt-1">•</span>
                          <span className="text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Process Section */}
        <section className="py-16 lg:py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold mb-4">How We Work</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Our streamlined process ensures a smooth experience from initial consultation to final installation
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { step: "01", title: "Consultation", description: "Discuss your needs and requirements" },
                { step: "02", title: "Design", description: "Create custom solutions for your space" },
                { step: "03", title: "Production", description: "Manufacturing with quality control" },
                { step: "04", title: "Installation", description: "Professional setup and activation" }
              ].map((item, index) => (
                <div key={index} className="text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent text-accent-foreground font-bold text-xl mb-4">
                    {item.step}
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default Services;
