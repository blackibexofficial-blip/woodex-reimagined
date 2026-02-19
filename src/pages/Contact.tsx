import { useState } from "react";
import { Mail, Phone, MapPin, Clock, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const showrooms = [
  { city: "Lahore (HQ)", address: "123 Gulberg III, Main Boulevard, Lahore", phone: "+92 42 111 WOODEX", hours: "Mon–Sat: 9am–7pm" },
  { city: "Karachi", address: "456 Clifton Block 5, Karachi", phone: "+92 21 111 WOODEX", hours: "Mon–Sat: 9am–7pm" },
  { city: "Islamabad", address: "789 Blue Area, F-7, Islamabad", phone: "+92 51 111 WOODEX", hours: "Mon–Sat: 10am–6pm" },
];

const Contact = () => {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 4000);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Page Header */}
        <section className="bg-primary text-primary-foreground py-14">
          <div className="container mx-auto px-4">
            <p className="text-accent text-xs font-bold uppercase tracking-widest mb-2">Contact Us</p>
            <h1 className="text-4xl lg:text-5xl font-black mb-3">Get in Touch</h1>
            <p className="text-primary-foreground/75 max-w-xl">
              Have questions about our products or services? We'd love to hear from you. Send us a message 
              and we'll respond as soon as possible.
            </p>
          </div>
        </section>

        {/* Contact Info + Form */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-3 gap-10">
              {/* Info Cards */}
              <div className="space-y-4">
                <h2 className="text-xl font-bold mb-6">Contact Information</h2>
                {[
                  { icon: Phone, title: "Call Us", lines: ["+92 300 1234567", "+92 42 111 WOODEX"] },
                  { icon: Mail, title: "Email Us", lines: ["info@woodex.pk", "sales@woodex.pk"] },
                  { icon: MapPin, title: "Head Office", lines: ["123 Gulberg III", "Lahore, Pakistan"] },
                  { icon: Clock, title: "Business Hours", lines: ["Mon–Sat: 9am–7pm", "Sun: Closed"] },
                ].map((item) => (
                  <div key={item.title} className="flex gap-4 p-4 border border-border rounded-sm hover:border-accent transition-colors">
                    <div className="w-10 h-10 rounded-sm bg-hon-green-pale flex items-center justify-center flex-shrink-0">
                      <item.icon className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm mb-1">{item.title}</p>
                      {item.lines.map((line) => (
                        <p key={line} className="text-sm text-muted-foreground">{line}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Form */}
              <div className="lg:col-span-2">
                <h2 className="text-xl font-bold mb-6">Send a Message</h2>
                <Card className="border shadow-sm">
                  <CardContent className="pt-6">
                    {submitted ? (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 rounded-full bg-hon-green-pale flex items-center justify-center mx-auto mb-4">
                          <Send className="h-8 w-8 text-accent" />
                        </div>
                        <h3 className="text-xl font-bold mb-2">Message Sent!</h3>
                        <p className="text-muted-foreground">We'll get back to you within 24 hours.</p>
                      </div>
                    ) : (
                      <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="grid md:grid-cols-2 gap-5">
                          <div className="space-y-1.5">
                            <Label htmlFor="name">Full Name *</Label>
                            <Input id="name" placeholder="John Smith" required />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="email">Email *</Label>
                            <Input id="email" type="email" placeholder="your@email.com" required />
                          </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-5">
                          <div className="space-y-1.5">
                            <Label htmlFor="phone">Phone</Label>
                            <Input id="phone" type="tel" placeholder="+92 300 1234567" />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="subject">Subject</Label>
                            <Input id="subject" placeholder="Product inquiry" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="message">Message *</Label>
                          <Textarea id="message" placeholder="Tell us about your project..." className="min-h-[140px]" required />
                        </div>
                        <Button type="submit" className="w-full bg-accent hover:bg-hon-green-dark text-accent-foreground font-semibold">
                          Send Message
                        </Button>
                      </form>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* Showrooms */}
        <section className="py-14 bg-section-light border-t">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <div className="w-12 h-1 bg-accent mx-auto mb-4" />
              <h2 className="text-3xl font-bold mb-3">Visit Our Showrooms</h2>
              <p className="text-muted-foreground">Experience our furniture in person at one of our showrooms</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {showrooms.map((s) => (
                <div key={s.city} className="p-6 bg-background border rounded-sm hover:border-accent transition-colors">
                  <div className="w-8 h-1 bg-accent mb-4" />
                  <h3 className="font-bold text-lg mb-3">{s.city}</h3>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" /><span>{s.address}</span></div>
                    <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-accent flex-shrink-0" /><span>{s.phone}</span></div>
                    <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-accent flex-shrink-0" /><span>{s.hours}</span></div>
                  </div>
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

export default Contact;
