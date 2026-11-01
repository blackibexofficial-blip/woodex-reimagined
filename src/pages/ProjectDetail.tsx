import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MapPin, Calendar, Ruler, Users, ChevronLeft, ChevronRight, Star, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useProject } from "@/hooks/useSite";

const ProjectDetail = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId);
  const [showBefore, setShowBefore] = useState(false);
  const [galleryIdx, setGalleryIdx] = useState(0);

  const gallery = project ? [project.image, project.beforeImage].filter(Boolean) as string[] : [];

  // The static shell publishes a head for this URL; this keeps the tab honest once the SPA takes over.
  useEffect(() => {
    if (project) document.title = `${project.title} — WOODEX Project`;
  }, [project]);

  if (!project) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Project Not Found</h1>
            <Button asChild><Link to="/projects">View All Projects</Link></Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative h-[55vh] min-h-[380px] overflow-hidden bg-primary">
          <img src={project.image} alt={project.title} className="absolute inset-0 w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/50 to-transparent" />
          <div className="absolute inset-0 flex items-end pb-10">
            <div className="container mx-auto px-4">
              <div className="flex items-center gap-2 text-sm mb-3">
                <Link to="/projects" className="text-accent hover:underline flex items-center gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" /> Portfolio
                </Link>
              </div>
              <Badge className="bg-accent text-accent-foreground mb-3">{project.category}</Badge>
              <h1 className="text-3xl lg:text-5xl font-black text-primary-foreground mb-2">{project.title}</h1>
              <p className="text-accent font-semibold">{project.client}</p>
            </div>
          </div>
        </section>

        {/* Stats Bar */}
        <section className="bg-accent text-accent-foreground py-5">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              {[
                { icon: MapPin, label: "Location", value: project.location },
                { icon: Ruler, label: "Project Size", value: project.sqft },
                { icon: Users, label: "Staff", value: project.employees ?? "" },
                { icon: Calendar, label: "Completion", value: [project.duration, project.year].filter(Boolean).join(" — ") },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center gap-2.5">
                  <stat.icon className="h-4 w-4 flex-shrink-0 opacity-80" />
                  <div>
                    <p className="text-xs opacity-75">{stat.label}</p>
                    <p className="font-semibold">{stat.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-3 gap-10">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-10">
                {/* Gallery */}
                <div>
                  <div className="relative aspect-video rounded-sm overflow-hidden bg-muted mb-3">
                    <img src={gallery[galleryIdx]} alt={project.title} className="w-full h-full object-cover" />
                    <button
                      onClick={() => setGalleryIdx((i) => (i - 1 + gallery.length) % gallery.length)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-primary/70 hover:bg-primary rounded-full flex items-center justify-center text-white"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => setGalleryIdx((i) => (i + 1) % gallery.length)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-primary/70 hover:bg-primary rounded-full flex items-center justify-center text-white"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {gallery.map((_, i) => (
                        <button key={i} onClick={() => setGalleryIdx(i)} className={`h-1.5 rounded-full transition-all ${i === galleryIdx ? "w-6 bg-accent" : "w-1.5 bg-white/50"}`} />
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {gallery.slice(0, 4).map((img, i) => (
                      <button key={i} onClick={() => setGalleryIdx(i)} className={`flex-1 aspect-video rounded-sm overflow-hidden border-2 transition-colors ${galleryIdx === i ? "border-accent" : "border-border"}`}>
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Before / After */}
                <div>
                  <h2 className="text-2xl font-bold mb-4">Before & After</h2>
                  <div className="relative aspect-video rounded-sm overflow-hidden bg-muted">
                    <img src={showBefore ? project.beforeImage : project.image} alt={showBefore ? "Before" : "After"} className="w-full h-full object-cover transition-opacity duration-500" />
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                      <button onClick={() => setShowBefore(true)} className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${showBefore ? "bg-accent text-accent-foreground" : "bg-primary/60 text-white hover:bg-primary"}`}>
                        Before
                      </button>
                      <button onClick={() => setShowBefore(false)} className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${!showBefore ? "bg-accent text-accent-foreground" : "bg-primary/60 text-white hover:bg-primary"}`}>
                        After
                      </button>
                    </div>
                    <div className="absolute top-4 left-4">
                      <Badge className={showBefore ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}>
                        {showBefore ? "Before Renovation" : "After WOODEX"}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <div className="w-12 h-1 bg-accent mb-4" />
                  <h2 className="text-2xl font-bold mb-4">Project Overview</h2>
                  <p className="text-muted-foreground leading-relaxed mb-6">{project.description}</p>
                  {/* A project created in the admin has a description and nothing else yet; an empty
                      "The Challenge" heading over blank space reads as a broken page, so it is skipped. */}
                  {project.challenge && (
                    <>
                      <h3 className="font-bold text-lg mb-2">The Challenge</h3>
                      <p className="text-muted-foreground leading-relaxed mb-6">{project.challenge}</p>
                    </>
                  )}
                  {project.solution && (
                    <>
                      <h3 className="font-bold text-lg mb-2">Our Solution</h3>
                      <p className="text-muted-foreground leading-relaxed">{project.solution}</p>
                    </>
                  )}
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Furniture Used */}
                {(project.furnitureUsed?.length ?? 0) > 0 && (
                <div className="p-6 border border-border rounded-sm">
                  <div className="w-8 h-1 bg-accent mb-4" />
                  <h3 className="font-bold mb-4">Furniture Used</h3>
                  <ul className="space-y-2.5">
                    {(project.furnitureUsed ?? []).map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                )}

                {/* Testimonial — only when there is one. */}
                {project.testimonial && (
                <div className="p-6 bg-section-light border border-border rounded-sm">
                  <div className="flex gap-0.5 mb-3">
                    {Array(project.rating ?? 5).fill(0).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground italic mb-4">"{project.testimonial.text}"</p>
                  <p className="font-bold text-sm">{project.testimonial.author}</p>
                  <p className="text-xs text-muted-foreground">{project.testimonial.role}</p>
                </div>
                )}

                {/* CTA */}
                <div className="p-6 bg-accent text-accent-foreground rounded-sm">
                  <h3 className="font-bold text-lg mb-2">Want a Similar Project?</h3>
                  <p className="text-sm opacity-85 mb-4">Tell us about your space and we'll create a tailored solution.</p>
                  <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" asChild>
                    <Link to="/quotation">Request a Quote</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Back to Projects */}
        <section className="py-10 border-t bg-section-light">
          <div className="container mx-auto px-4 text-center">
            <Button variant="outline" className="border-accent text-accent hover:bg-accent hover:text-accent-foreground" asChild>
              <Link to="/projects"><ArrowLeft className="h-4 w-4 mr-2" />Back to All Projects</Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default ProjectDetail;
