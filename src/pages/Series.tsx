import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Series = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">
        <section className="py-16">
          <div className="container mx-auto px-4">
            <h1 className="text-4xl font-bold mb-4">Furniture Series</h1>
            <p className="text-muted-foreground text-lg mb-12">
              Explore our curated collections designed for different workspace needs
            </p>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {["Executive Series", "Modern Series", "Classic Series", "Eco Series", "Budget Series", "Premium Series"].map((series, index) => (
                <Card key={index}>
                  <div className="aspect-video bg-muted"></div>
                  <CardContent className="pt-4">
                    <h3 className="font-semibold text-xl">{series}</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      Discover our {series.toLowerCase()} collection
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

export default Series;
