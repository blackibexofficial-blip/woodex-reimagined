import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Calendar, Clock, ArrowRight, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import blogErgonomic from "@/assets/blog-ergonomic.jpg";
import blogHybrid from "@/assets/blog-hybrid-workspace.jpg";
import blogSustainable from "@/assets/blog-sustainable.jpg";
import blogColors from "@/assets/blog-office-colors.jpg";
import blogCaseStudy from "@/assets/blog-case-study.jpg";
import blogStandingDesk from "@/assets/blog-standing-desk.jpg";

const blogPosts = [
  {
    id: "ergonomic-office-guide-2025",
    title: "The Complete Guide to Ergonomic Office Furniture in 2025",
    excerpt: "Discover how the right office chair and desk setup can reduce back pain, boost productivity, and improve employee wellbeing. Expert tips from WOODEX's certified ergonomists.",
    image: blogErgonomic,
    category: "Ergonomics",
    author: "Dr. Farah Khan",
    date: "Feb 15, 2025",
    readTime: "8 min read",
    featured: true,
  },
  {
    id: "hybrid-workspace-design",
    title: "Designing Hybrid Workspaces: Furniture That Adapts",
    excerpt: "How Pakistani companies are rethinking office layouts for hybrid work. Modular furniture, hot-desking solutions, and collaborative zones explained.",
    image: blogHybrid,
    category: "Workspace Design",
    author: "Ahmed Raza",
    date: "Feb 8, 2025",
    readTime: "6 min read",
  },
  {
    id: "sustainable-furniture-pakistan",
    title: "Sustainable Furniture Manufacturing in Pakistan",
    excerpt: "WOODEX's commitment to eco-friendly production — from FSC-certified wood sourcing to zero-waste manufacturing practices in our Lahore facility.",
    image: blogSustainable,
    category: "Sustainability",
    author: "Sara Malik",
    date: "Jan 28, 2025",
    readTime: "5 min read",
  },
  {
    id: "office-color-psychology",
    title: "How Office Colors Affect Productivity: A Research-Backed Guide",
    excerpt: "Blue for focus, green for creativity, and warm tones for collaboration — the science behind choosing the right furniture finishes for your workspace.",
    image: blogColors,
    category: "Interior Design",
    author: "Hina Javed",
    date: "Jan 20, 2025",
    readTime: "7 min read",
  },
  {
    id: "corporate-case-study-allied-bank",
    title: "Case Study: Furnishing 8 Allied Bank Branches Across Punjab",
    excerpt: "How WOODEX delivered 200+ workstations, executive suites, and customer service counters across 8 branches in just 6 weeks — on time and on budget.",
    image: blogCaseStudy,
    category: "Case Study",
    author: "Bilal Ahmed",
    date: "Jan 12, 2025",
    readTime: "10 min read",
  },
  {
    id: "standing-desk-benefits",
    title: "Standing Desks in Pakistan: Are They Worth the Investment?",
    excerpt: "A comprehensive analysis of sit-stand desks for Pakistani offices — health benefits, ROI calculations, and the best models for different budgets.",
    image: blogStandingDesk,
    category: "Ergonomics",
    author: "Dr. Farah Khan",
    date: "Jan 5, 2025",
    readTime: "6 min read",
  },
];

const categories = ["All", "Ergonomics", "Workspace Design", "Sustainability", "Interior Design", "Case Study"];

const Blog = () => {
  useEffect(() => {
    document.title = "Blog — WOODEX Pakistan | Office Design Tips, Trends & Case Studies";
  }, []);

  const featured = blogPosts.find((p) => p.featured);
  const rest = blogPosts.filter((p) => !p.featured);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative h-72 overflow-hidden bg-primary">
          <img src={blogErgonomic} alt="WOODEX Blog" className="w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 flex items-center">
            <div className="container mx-auto px-4">
              <p className="text-accent text-xs font-bold uppercase tracking-widest mb-2">Ideas & Inspiration</p>
              <h1 className="text-4xl lg:text-5xl font-black text-primary-foreground mb-3">WOODEX Blog</h1>
              <p className="text-primary-foreground/75 max-w-xl">
                Expert insights on office design, ergonomics, sustainability, and workspace productivity from Pakistan's leading furniture manufacturer.
              </p>
            </div>
          </div>
        </section>

        {/* Category Filter */}
        <section className="py-4 bg-background border-b sticky top-16 z-20">
          <div className="container mx-auto px-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <Button
                  key={cat}
                  variant={cat === "All" ? "default" : "outline"}
                  size="sm"
                  className={cat === "All" ? "bg-accent text-accent-foreground hover:bg-accent/90" : "border-border hover:border-accent hover:text-accent"}
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>
        </section>

        {/* Featured Post */}
        {featured && (
          <section className="py-12 bg-background">
            <div className="container mx-auto px-4">
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="aspect-video rounded-sm overflow-hidden">
                  <img src={featured.image} alt={featured.title} className="w-full h-full object-cover" />
                </div>
                <div>
                  <Badge className="bg-accent text-accent-foreground mb-3">{featured.category}</Badge>
                  <h2 className="text-2xl lg:text-3xl font-bold mb-4 leading-tight">{featured.title}</h2>
                  <p className="text-muted-foreground leading-relaxed mb-5">{featured.excerpt}</p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
                    <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{featured.author}</span>
                    <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{featured.date}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{featured.readTime}</span>
                  </div>
                  <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                    Read Article <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Posts Grid */}
        <section className="py-12 bg-section-light border-t">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl font-bold mb-8">Latest Articles</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {rest.map((post) => (
                <article key={post.id} className="group bg-background border border-border rounded-sm overflow-hidden hover:border-accent hover:shadow-lg transition-all">
                  <div className="aspect-video overflow-hidden">
                    <img src={post.image} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <div className="p-5">
                    <Badge variant="outline" className="mb-3 text-accent border-accent">{post.category}</Badge>
                    <h3 className="font-bold text-lg mb-2 group-hover:text-accent transition-colors leading-snug">{post.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-2">{post.excerpt}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{post.author}</span>
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{post.date}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Newsletter CTA */}
        <section className="py-14 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-3">Stay Updated</h2>
            <p className="text-primary-foreground/75 mb-7 max-w-md mx-auto">
              Subscribe to our newsletter for the latest office design trends, product launches, and exclusive offers.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Button className="bg-accent hover:bg-accent/90 text-accent-foreground px-8" asChild>
                <Link to="/contact">Subscribe Now</Link>
              </Button>
              <Button variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10" asChild>
                <Link to="/shop">Browse Products</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Blog;
