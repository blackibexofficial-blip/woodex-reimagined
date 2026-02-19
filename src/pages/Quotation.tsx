import { useState } from "react";
import { CheckCircle, Clock, Shield, Users, Headphones, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 5000);
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
                              <option value="chairs">Ergonomic Chairs</option>
                              <option value="desks">Executive Desks</option>
                              <option value="workstations">Workstations</option>
                              <option value="tables">Meeting Tables</option>
                              <option value="storage">Office Storage</option>
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
