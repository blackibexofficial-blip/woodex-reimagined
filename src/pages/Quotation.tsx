import { CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Quotation = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-background py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 bg-muted px-4 py-2 rounded-full mb-6">
                <span className="text-2xl">📋</span>
                <span className="text-sm font-medium text-muted-foreground">NEW SERVICE</span>
              </div>
              <h1 className="text-4xl lg:text-6xl font-bold mb-6">
                Get Instant Quotation
              </h1>
              <p className="text-lg text-muted-foreground">
                Fast, transparent pricing for all your office furniture needs. Fill out the form below and 
                receive a detailed quote within 24 hours.
              </p>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-12 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  title: "24-Hour Response",
                  description: "Receive detailed quotes within one business day"
                },
                {
                  title: "Transparent Pricing",
                  description: "Clear breakdown of costs with no hidden fees"
                },
                {
                  title: "No Obligation",
                  description: "Free quotes with no pressure to commit"
                },
                {
                  title: "Expert Advice",
                  description: "Recommendations based on your specific needs"
                }
              ].map((benefit, index) => (
                <Card key={index}>
                  <CardContent className="pt-6">
                    <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-4">
                      <CheckCircle className="h-6 w-6 text-accent" />
                    </div>
                    <h3 className="font-semibold mb-2">{benefit.title}</h3>
                    <p className="text-sm text-muted-foreground">{benefit.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Form Section */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <Card>
                <CardContent className="pt-8">
                  <form className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="name">Full Name *</Label>
                        <Input id="name" placeholder="John Smith" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="company">Company Name *</Label>
                        <Input id="company" placeholder="Your Company Ltd." required />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Address *</Label>
                        <Input id="email" type="email" placeholder="john@company.com" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number *</Label>
                        <Input id="phone" type="tel" placeholder="+971 50 123 4567" required />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="category">Product Category *</Label>
                      <select 
                        id="category" 
                        className="w-full h-10 px-3 rounded-md border border-input bg-background"
                        required
                      >
                        <option value="">Select a category</option>
                        <option value="chairs">Ergonomic Chairs</option>
                        <option value="desks">Executive Desks</option>
                        <option value="workstations">Workstations</option>
                        <option value="tables">Meeting Tables</option>
                        <option value="storage">Office Storage</option>
                        <option value="custom">Custom Design</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="quantity">Estimated Quantity</Label>
                      <Input id="quantity" type="number" placeholder="10" min="1" />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">Project Details *</Label>
                      <Textarea 
                        id="message" 
                        placeholder="Please describe your requirements, timeline, and any specific preferences..."
                        className="min-h-[120px]"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="budget">Budget Range (Optional)</Label>
                      <select 
                        id="budget" 
                        className="w-full h-10 px-3 rounded-md border border-input bg-background"
                      >
                        <option value="">Select budget range</option>
                        <option value="under-50k">Under AED 50,000</option>
                        <option value="50k-100k">AED 50,000 - 100,000</option>
                        <option value="100k-250k">AED 100,000 - 250,000</option>
                        <option value="over-250k">Over AED 250,000</option>
                      </select>
                    </div>

                    <Button type="submit" size="lg" className="w-full">
                      Submit Request
                    </Button>

                    <p className="text-sm text-muted-foreground text-center">
                      By submitting this form, you agree to our privacy policy and terms of service.
                    </p>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default Quotation;
