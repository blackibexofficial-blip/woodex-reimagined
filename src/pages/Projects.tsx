import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Projects = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">
        <section className="py-16">
          <div className="container mx-auto px-4">
            <h1 className="text-4xl font-bold mb-4">Our Projects</h1>
            <p className="text-muted-foreground text-lg mb-12">
              See how we've transformed workspaces for leading companies
            </p>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3, 4, 5, 6].map((project) => (
                <Card key={project}>
                  <div className="aspect-video bg-muted"></div>
                  <CardContent className="pt-4">
                    <h3 className="font-semibold text-xl mb-2">Corporate Office #{project}</h3>
                    <p className="text-sm text-muted-foreground">
                      Complete office transformation with custom furniture solutions
                    </p>
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

export default Projects;
