import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, Clock, Shield, Users, Headphones, Star, Trash2, Minus, Plus, Printer, ShoppingBag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useQuote } from "@/contexts/QuoteContext";
import { formatPKR } from "@/data/products";
import { useEffect } from "react";

const benefits = [
  { icon: Clock, title: "24-Hour Response", description: "Receive detailed quotes within one business day" },
  { icon: Shield, title: "Transparent Pricing", description: "Clear breakdown with no hidden fees" },
  { icon: Users, title: "No Obligation", description: "Free quotes with zero pressure to commit" },
  { icon: Headphones, title: "Expert Advice", description: "Personalized recommendations for your needs" },
];

const testimonials = [
  { name: "Muhammad Tariq", company: "Tariq & Associates", text: "The quotation process was smooth and the team was very responsive. Excellent service!", rating: 5 },
  { name: "Sana Qureshi", company: "TechBridge Pvt Ltd", text: "Got our 40-person office furnished within budget. WOODEX made it effortless.", rating: 5 },
];

const Quotation = () => {
  const [submitted, setSubmitted] = useState(false);
  const { items, removeItem, updateQuantity, totalPrice, totalItems } = useQuote();
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Get E-Quotation — WOODEX Pakistan | Free Quote Request";
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 5000);
  };

  const handlePrintQuote = () => {
    window.print();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-primary text-primary-foreground py-14">
          <div className="container mx-auto px-4">
            <p className="text-accent text-xs font-bold uppercase tracking-widest mb-2">Free Service</p>
            <h1 className="text-4xl lg:text-5xl font-black mb-3">Get an E-Quotation</h1>
            <p className="text-primary-foreground/75 max-w-xl">
              Fast, transparent pricing for all your office furniture needs. Fill out the form and 
              receive a detailed quote within 24 hours.
            </p>
          </div>
        </section>

        {/* Benefits Bar */}
        <section className="bg-accent py-6">
          <div className="container mx-auto px-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {benefits.map((b) => (
                <div key={b.title} className="flex items-center gap-3 text-accent-foreground">
                  <b.icon className="h-5 w-5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">{b.title}</p>
                    <p className="text-xs opacity-80">{b.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Quote Basket Items */}
        {items.length > 0 && (
          <section className="py-8 bg-section-light border-b" ref={printRef}>
            <div className="container mx-auto px-4">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <ShoppingBag className="h-5 w-5 text-accent" />
                  <h2 className="text-xl font-bold">Your Quote Basket ({totalItems} items)</h2>
                </div>
                <Button variant="outline" size="sm" className="border-accent text-accent hover:bg-accent hover:text-accent-foreground gap-2" onClick={handlePrintQuote}>
                  <Printer className="h-4 w-4" />
                  Print / Download PDF
                </Button>
              </div>

              <div className="bg-background border border-border rounded-sm overflow-hidden">
                <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 bg-section-light text-xs font-bold uppercase tracking-wider text-muted-foreground border-b">
                  <div className="col-span-5">Product</div>
                  <div className="col-span-2 text-center">Color</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-2 text-right">Price</div>
                  <div className="col-span-1"></div>
                </div>
                {items.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-4 px-5 py-4 items-center border-b border-border last:border-b-0">
                    <div className="col-span-12 sm:col-span-5">
                      <Link to={`/shop/${item.id}`} className="font-semibold text-sm hover:text-accent transition-colors">{item.name}</Link>
                      <p className="text-xs text-muted-foreground">{item.category}</p>
                    </div>
                    <div className="col-span-4 sm:col-span-2 text-center text-sm text-muted-foreground">{item.color || "—"}</div>
                    <div className="col-span-4 sm:col-span-2 flex items-center justify-center gap-2">
                      <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="w-7 h-7 border border-border rounded-sm flex items-center justify-center hover:border-accent transition-colors">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="w-7 h-7 border border-border rounded-sm flex items-center justify-center hover:border-accent transition-colors">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="col-span-3 sm:col-span-2 text-right font-semibold text-sm">{formatPKR(item.price * item.quantity)}</div>
                    <div className="col-span-1 text-right">
                      <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="px-5 py-4 bg-section-light border-t flex items-center justify-between">
                  <span className="font-bold">Estimated Total</span>
                  <span className="text-xl font-black text-accent">{formatPKR(totalPrice)}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">* Final pricing may vary based on customization, delivery location, and quantity discounts.</p>
            </div>
          </section>
        )}

        {/* Main Form + Sidebar */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-3 gap-10">
              {/* Sidebar */}
              <div className="space-y-6">
                <div className="p-6 bg-section-light rounded-sm border">
                  <div className="w-10 h-1 bg-accent mb-4" />
                  <h3 className="font-bold text-lg mb-3">What to Expect</h3>
                  <div className="space-y-3">
                    {[
                      { step: "1", text: "Submit your requirements" },
                      { step: "2", text: "Expert reviews your needs" },
                      { step: "3", text: "Receive detailed quote in 24hrs" },
                      { step: "4", text: "Schedule free consultation" },
                    ].map((item) => (
                      <div key={item.step} className="flex gap-3 items-start text-sm">
                        <div className="w-6 h-6 rounded-full bg-accent text-accent-foreground text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {item.step}
                        </div>
                        <span className="text-muted-foreground pt-0.5">{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-6 bg-section-light rounded-sm border">
                  <h3 className="font-bold mb-3">Why WOODEX?</h3>
                  {[
                    "20+ years manufacturing experience",
                    "500+ satisfied corporate clients",
                    "Nationwide delivery & installation",
                    "5-year warranty available",
                    "Custom design service",
                  ].map((item) => (
                    <div key={item} className="flex gap-2 items-start text-sm mb-2">
                      <CheckCircle className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">{item}</span>
                    </div>
                  ))}
                </div>

                {/* Testimonials */}
                <div className="space-y-3">
                  {testimonials.map((t) => (
                    <div key={t.name} className="p-4 bg-background border rounded-sm">
                      <div className="flex gap-0.5 mb-2">
                        {Array(t.rating).fill(0).map((_, i) => (
                          <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                      <p className="text-sm text-muted-foreground italic mb-2">"{t.text}"</p>
                      <p className="text-xs font-bold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.company}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Form */}
              <div className="lg:col-span-2">
                <Card className="border shadow-sm">
                  <CardContent className="pt-8">
                    {submitted ? (
                      <div className="text-center py-16">
                        <div className="w-20 h-20 rounded-full bg-hon-green-pale flex items-center justify-center mx-auto mb-5">
                          <CheckCircle className="h-10 w-10 text-accent" />
                        </div>
                        <h3 className="text-2xl font-bold mb-2">Quote Request Submitted!</h3>
                        <p className="text-muted-foreground max-w-sm mx-auto">
                          Thank you! Our team will review your requirements and get back to you within 24 business hours.
                        </p>
                      </div>
                    ) : (
                      <form onSubmit={handleSubmit} className="space-y-5">
                        {items.length > 0 && (
                          <div className="p-4 bg-hon-green-pale rounded-sm border border-accent/30 mb-2">
                            <p className="text-sm font-semibold text-accent">
                              ✓ {totalItems} product{totalItems !== 1 ? "s" : ""} from your quote basket will be included ({formatPKR(totalPrice)} estimated)
                            </p>
                          </div>
                        )}
                        <div className="grid md:grid-cols-2 gap-5">
                          <div className="space-y-1.5">
                            <Label htmlFor="name">Full Name *</Label>
                            <Input id="name" placeholder="Muhammad Ali" required />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="company">Company Name *</Label>
                            <Input id="company" placeholder="Your Company Ltd." required />
                          </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-5">
                          <div className="space-y-1.5">
                            <Label htmlFor="email">Email Address *</Label>
                            <Input id="email" type="email" placeholder="ali@company.com" required />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="phone">Phone Number *</Label>
                            <Input id="phone" type="tel" placeholder="+92 300 1234567" required />
                          </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-5">
                          <div className="space-y-1.5">
                            <Label htmlFor="category">Product Category *</Label>
                            <select id="category" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" required>
                              <option value="">Select a category</option>
                              <option value="executive-tables">Executive Tables</option>
                              <option value="manager-tables">Manager Tables</option>
                              <option value="staff-tables">Staff Tables</option>
                              <option value="meeting-tables">Meeting Tables</option>
                              <option value="chairs">Ergonomic Chairs</option>
                              <option value="workstations">Workstations</option>
                              <option value="cubicle">Cubicle Workstations</option>
                              <option value="sofas">Office Sofas</option>
                              <option value="storage">Office Storage</option>
                              <option value="home">Home Furniture</option>
                              <option value="packages">Room Packages</option>
                              <option value="custom">Custom Design</option>
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="quantity">Estimated Quantity</Label>
                            <Input id="quantity" type="number" placeholder="10" min="1" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="city">Delivery City *</Label>
                          <select id="city" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" required>
                            <option value="">Select city</option>
                            <option value="lahore">Lahore</option>
                            <option value="karachi">Karachi</option>
                            <option value="islamabad">Islamabad</option>
                            <option value="rawalpindi">Rawalpindi</option>
                            <option value="faisalabad">Faisalabad</option>
                            <option value="multan">Multan</option>
                            <option value="peshawar">Peshawar</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="budget">Budget Range</Label>
                          <select id="budget" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                            <option value="">Select budget range</option>
                            <option value="under-500k">Under PKR 500,000</option>
                            <option value="500k-2m">PKR 500K – 2 Million</option>
                            <option value="2m-10m">PKR 2M – 10 Million</option>
                            <option value="over-10m">Over PKR 10 Million</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="message">Project Details *</Label>
                          <Textarea
                            id="message"
                            placeholder="Please describe your requirements, timeline, office size, any specific preferences or brand guidelines..."
                            className="min-h-[130px]"
                            required
                          />
                        </div>
                        <Button type="submit" size="lg" className="w-full bg-accent hover:bg-hon-green-dark text-accent-foreground font-semibold">
                          Submit Quote Request
                        </Button>
                        <p className="text-xs text-muted-foreground text-center">
                          By submitting this form, you agree to our privacy policy. No spam, ever.
                        </p>
                      </form>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Quotation;
