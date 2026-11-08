import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QuoteProvider } from "@/contexts/QuoteContext";
import { CartProvider } from "@/contexts/CartContext";
import RouteHead from "@/components/RouteHead";
import ChatBubble from "@/components/chat/ChatBubble";
// Landing experience stays eager (LCP); every other storefront route is a separate chunk.
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const Shop = lazy(() => import("./pages/Shop"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const RoomPackages = lazy(() => import("./pages/RoomPackages"));
const VirtualShowroom = lazy(() => import("./pages/VirtualShowroom"));
const Series = lazy(() => import("./pages/Series"));
const SeriesDetail = lazy(() => import("./pages/SeriesDetail"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const Services = lazy(() => import("./pages/Services"));
const ServiceDetail = lazy(() => import("./pages/ServiceDetail"));
const B2B = lazy(() => import("./pages/B2B"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const CustomDesign = lazy(() => import("./pages/CustomDesign"));
const Quotation = lazy(() => import("./pages/Quotation"));
const Showrooms = lazy(() => import("./pages/Showrooms"));
const Materials = lazy(() => import("./pages/Materials"));
const Warranty = lazy(() => import("./pages/Warranty"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const Checkout = lazy(() => import("./pages/Checkout"));
// Admin panel — separate async chunk, storefront visitors never download it.
const AdminApp = lazy(() => import("./admin/AdminApp"));
const LabPreview = lazy(() => import("./pages-builder/LabPreview"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center bg-secondary">
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <span className="h-2.5 w-2.5 animate-ping rounded-full bg-accent" aria-hidden />
      <span className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">Loading…</span>
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <QuoteProvider>
      <CartProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <RouteHead />
          <ChatBubble />
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/shop/:productId" element={<ProductDetail />} />
              <Route path="/room-packages" element={<RoomPackages />} />
              <Route path="/virtual-showroom" element={<VirtualShowroom />} />
              <Route path="/series" element={<Series />} />
              <Route path="/series/:seriesId" element={<SeriesDetail />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:projectId" element={<ProjectDetail />} />
              <Route path="/services" element={<Services />} />
              <Route path="/services/:slug" element={<ServiceDetail />} />
              <Route path="/b2b" element={<B2B />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/custom-design" element={<CustomDesign />} />
              <Route path="/quotation" element={<Quotation />} />
              <Route path="/showrooms" element={<Showrooms />} />
              <Route path="/materials" element={<Materials />} />
              <Route path="/warranty" element={<Warranty />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/:postId" element={<BlogPost />} />
              <Route path="/checkout" element={<Checkout />} />
              {/* Admin panel — self-contained (own auth + layout) */}
              <Route path="/admin/*" element={<AdminApp />} />
              <Route path="/lab/:slug" element={<LabPreview />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
      </CartProvider>
    </QuoteProvider>
  </QueryClientProvider>
);

export default App;
