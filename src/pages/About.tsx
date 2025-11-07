import { Award, Target, Users, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const About = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <h1 className="text-4xl lg:text-6xl font-bold mb-6">About WOODEX</h1>
            <p className="text-xl text-muted-foreground max-w-3xl mb-12">
              Pakistan's leading office furniture manufacturer with over two decades of experience in 
              creating exceptional workspace solutions.
            </p>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { icon: Award, title: "20+ Years", description: "Industry Experience" },
                { icon: Users, title: "500+", description: "Happy Clients" },
                { icon: Globe, title: "50+", description: "Cities Served" },
                { icon: Target, title: "98%", description: "Satisfaction Rate" }
              ].map((stat, index) => (
                <Card key={index}>
                  <CardContent className="pt-6 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent/10 mb-4">
                      <stat.icon className="h-6 w-6 text-accent" />
                    </div>
                    <h3 className="text-3xl font-bold mb-2">{stat.title}</h3>
                    <p className="text-muted-foreground">{stat.description}</p>
                  </CardContent>
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

export default About;
