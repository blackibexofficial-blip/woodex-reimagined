import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart, Truck, CreditCard, Banknote, ChevronLeft, CheckCircle, MapPin, Phone, User, Mail } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/contexts/CartContext";
import { ApiError } from "@/lib/api/client";
import { fetchQuote, placeOrder, type OrderReceipt } from "@/lib/api/checkout";
import { CATALOG_OFFLINE } from "@/hooks/useCatalog";
import { formatPKR } from "@/data/products";

const cities = [
  "Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan",
  "Peshawar", "Quetta", "Sialkot", "Gujranwala", "Hyderabad", "Bahawalpur",
];

const Checkout = () => {
  const { items, totalPrice, totalItems, clearCart } = useCart();
  const navigate = useNavigate();
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "bank">("cod");
  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "", email: "", phone: "", address: "", city: "Lahore", notes: "",
  });

  useEffect(() => {
    document.title = "Checkout — WOODEX Pakistan";
  }, []);

  const lines = useMemo(
    () => items.map((item) => ({ slug: item.id, qty: item.quantity, color: item.color })),
    [items],
  );

  /**
   * The server prices the basket; the page only draws it.
   *
   * The signature is the identity of the basket — a quantity change makes a new query, so two
   * customers on the same wifi cannot be shown each other's totals from a shared cache key.
   */
  const signature = lines.map((line) => `${line.slug}:${line.qty}:${line.color ?? ""}`).join("|");

  const quote = useQuery({
    queryKey: ["checkout", "quote", signature],
    queryFn: ({ signal }) => fetchQuote(lines, signal),
    enabled: lines.length > 0 && !CATALOG_OFFLINE,
    retry: 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const totals = quote.data?.totals;

  // What the page shows before the server answers — and the only numbers it shows at all in a
  // build preview with no backend. The rule mirrors CartService::cashOnDelivery(): ₨2,500
  // delivery, free over ₨200,000. When the quote arrives it replaces all of this.
  const estimateDelivery = totalPrice >= 200_000 ? 0 : 2500;
  const subtotal = totals ? totals.subtotal / 100 : totalPrice;
  const tax = totals ? totals.tax_total / 100 : null;
  const deliveryFee = totals ? totals.shipping_total / 100 : estimateDelivery;
  const grandTotal = totals ? totals.grand_total / 100 : totalPrice + estimateDelivery;

  const [formError, setFormError] = useState<Record<string, string[]>>({});

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFormError({});
    setSubmitting(true);

    try {
      const order = await placeOrder({
        lines,
        gateway: paymentMethod,
        customer: {
          name: formData.name,
          phone: formData.phone,
          email: formData.email || undefined,
        },
        shipping: { line1: formData.address, city: formData.city },
        notes: formData.notes || undefined,
      });

      setReceipt(order);
      clearCart();
      window.scrollTo(0, 0);
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.code === "validation_error") {
          setFormError(caught.fields);
          setError(caught.message);
        } else if (caught.status === 0) {
          setError(
            "We could not reach our order system, so nothing has been charged. Your basket is saved — call or WhatsApp us on +92 300 000 0000 and we will place the same order for you.",
          );
        } else {
          setError(caught.message);
        }
      } else {
        setError("Something went wrong while placing the order. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (receipt) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center py-20">
          <div className="text-center max-w-md mx-auto px-4">
            <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-10 w-10 text-accent" />
            </div>
            <h1 className="text-3xl font-bold mb-3">Order Confirmed</h1>
            <p className="text-muted-foreground mb-4">
              Thank you. Our team will contact you within 24 hours to confirm delivery details.
            </p>

            <div className="bg-section-light border border-border rounded-sm p-4 mb-4 text-left space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Order number</span>
                <span className="font-mono font-semibold">{receipt.number}</span>
              </div>
              {receipt.invoice_number && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Invoice</span>
                  <span className="font-mono">{receipt.invoice_number}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold">{receipt.total}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Delivery</span>
                <span>3–{receipt.shipping_estimate_days} working days</span>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-8">
              {receipt.payment_method === "cod"
                ? "Payment will be collected on delivery."
                : "Our team will share bank details for transfer."}
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Button className="bg-accent hover:bg-accent/90 text-accent-foreground" asChild>
                <Link to="/shop">Continue Shopping</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/">Back to Home</Link>
              </Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center py-20">
          <div className="text-center">
            <ShoppingCart className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Your cart is empty</h1>
            <p className="text-muted-foreground mb-6">Add products to your cart before checking out.</p>
            <Button className="bg-accent hover:bg-accent/90 text-accent-foreground" asChild>
              <Link to="/shop">Browse Products</Link>
            </Button>
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
        <section className="bg-primary text-primary-foreground py-8">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-2 mb-2">
              <Link to="/shop" className="text-primary-foreground/60 hover:text-primary-foreground text-sm flex items-center gap-1">
                <ChevronLeft className="h-3.5 w-3.5" /> Back to Shop
              </Link>
            </div>
            <h1 className="text-3xl lg:text-4xl font-black">Checkout</h1>
          </div>
        </section>

        <section className="py-10">
          <div className="container mx-auto px-4">
            <form onSubmit={handleSubmit}>
              <div className="grid lg:grid-cols-3 gap-8">
                {/* Left: Form */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Delivery Info */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <MapPin className="h-5 w-5 text-accent" /> Delivery Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="name">Full Name *</Label>
                          <Input id="name" placeholder="Muhammad Ali" required value={formData.name} onChange={(e) => handleChange("name", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="phone">Phone Number *</Label>
                          <Input id="phone" type="tel" placeholder="+92 300 1234567" required value={formData.phone} onChange={(e) => handleChange("phone", e.target.value)} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" placeholder="your@email.com" value={formData.email} onChange={(e) => handleChange("email", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="address">Delivery Address *</Label>
                        <Textarea id="address" placeholder="House/Office #, Street, Area, City" required value={formData.address} onChange={(e) => handleChange("address", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="city">City *</Label>
                        <select
                          id="city"
                          value={formData.city}
                          onChange={(e) => handleChange("city", e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          required
                        >
                          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="notes">Order Notes (optional)</Label>
                        <Textarea id="notes" placeholder="Special instructions for delivery..." value={formData.notes} onChange={(e) => handleChange("notes", e.target.value)} />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Payment Method */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <CreditCard className="h-5 w-5 text-accent" /> Payment Method
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value === "bank" ? "bank" : "cod")} className="space-y-3">
                        <label className={`flex items-center gap-4 p-4 border rounded-sm cursor-pointer transition-colors ${paymentMethod === "cod" ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"}`}>
                          <RadioGroupItem value="cod" id="cod" />
                          <Banknote className="h-5 w-5 text-accent" />
                          <div>
                            <p className="font-semibold text-sm">Cash on Delivery (COD)</p>
                            <p className="text-xs text-muted-foreground">Pay when your furniture is delivered & installed</p>
                          </div>
                        </label>
                        <label className={`flex items-center gap-4 p-4 border rounded-sm cursor-pointer transition-colors ${paymentMethod === "bank" ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"}`}>
                          <RadioGroupItem value="bank" id="bank" />
                          <CreditCard className="h-5 w-5 text-accent" />
                          <div>
                            <p className="font-semibold text-sm">Bank Transfer</p>
                            <p className="text-xs text-muted-foreground">Transfer to WOODEX bank account — details will be shared after order</p>
                          </div>
                        </label>
                      </RadioGroup>
                    </CardContent>
                  </Card>
                </div>

                {/* Right: Order Summary */}
                <div>
                  <Card className="sticky top-28">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <ShoppingCart className="h-5 w-5 text-accent" /> Order Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {items.map((item) => (
                        <div key={`${item.id}-${item.color}`} className="flex gap-3">
                          {item.image && (
                            <div className="w-12 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-muted">
                              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium line-clamp-1">{item.name}</p>
                            {item.color && <p className="text-xs text-muted-foreground">{item.color}</p>}
                            <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                          </div>
                          <p className="text-sm font-semibold whitespace-nowrap">{formatPKR(item.price * item.quantity)}</p>
                        </div>
                      ))}

                      <Separator />

                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Subtotal ({totalItems} items)</span>
                          <span className="font-medium">{formatPKR(subtotal)}</span>
                        </div>
                        {tax !== null && tax > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Sales tax (18%)</span>
                            <span className="font-medium">{formatPKR(tax)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Delivery</span>
                          <span className="font-medium">{deliveryFee === 0 ? <span className="text-accent">FREE</span> : formatPKR(deliveryFee)}</span>
                        </div>
                        {deliveryFee > 0 && (
                          <p className="text-xs text-muted-foreground">Free delivery on orders above PKR 200,000</p>
                        )}
                        {!totals && !quote.isPending && (
                          <p className="text-xs text-muted-foreground">
                            Estimated total — the order system confirms delivery and tax when you place it.
                          </p>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Assembly</span>
                          <span className="text-accent text-xs font-semibold">FREE</span>
                        </div>
                      </div>

                      <Separator />

                      <div className="flex justify-between items-center">
                        <span className="font-bold text-lg">Total</span>
                        <span className="font-bold text-xl text-accent">{formatPKR(grandTotal)}</span>
                      </div>

                      {error && (
                        <div role="alert" className="border border-destructive/40 bg-destructive/5 text-sm rounded-sm p-3 space-y-1">
                          <p className="font-medium text-destructive">We could not place this order</p>
                          <p className="text-muted-foreground">{error}</p>
                          {Object.entries(formError).length > 0 && (
                            <ul className="list-disc pl-4 text-xs text-muted-foreground">
                              {Object.entries(formError).map(([field, messages]) => (
                                <li key={field}>{messages[0]}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      <Button
                        type="submit"
                        disabled={submitting}
                        className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-base h-12 disabled:opacity-70"
                      >
                        {submitting
                          ? "Placing your order…"
                          : paymentMethod === "cod"
                            ? "Place Order — Cash on Delivery"
                            : "Place Order — Bank Transfer"}
                      </Button>

                      <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Truck className="h-3.5 w-3.5 mt-0.5 text-accent flex-shrink-0" />
                        <span>Professional delivery & assembly included. Our team will contact you to schedule delivery.</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </form>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Checkout;
