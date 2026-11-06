Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  try {
    const { items, companyId } = await req.json();

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid items array' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Calculate base total
    let baseTotal = 0;
    const itemsWithPricing = items.map(item => {
      const itemTotal = item.price * item.quantity;
      baseTotal += itemTotal;
      return { ...item, itemTotal };
    });

    // Calculate total quantity for bulk discount
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

    // Determine bulk discount percentage
    let bulkDiscountPercent = 0;
    if (totalQuantity >= 51) {
      bulkDiscountPercent = 15;
    } else if (totalQuantity >= 21) {
      bulkDiscountPercent = 10;
    } else if (totalQuantity >= 6) {
      bulkDiscountPercent = 5;
    }

    // Apply bulk discount
    const bulkDiscount = (baseTotal * bulkDiscountPercent) / 100;
    const subtotal = baseTotal - bulkDiscount;

    // Apply company-specific discount if B2B customer
    let companyDiscount = 0;
    let companyDiscountPercent = 0;
    
    if (companyId) {
      // In real implementation, fetch company discount tier from database
      // For now, using sample tiers
      companyDiscountPercent = 5; // Standard B2B discount
      companyDiscount = (subtotal * companyDiscountPercent) / 100;
    }

    const finalSubtotal = subtotal - companyDiscount;
    
    // Calculate tax (2% GST for Pakistan)
    const tax = (finalSubtotal * 2) / 100;
    
    // Calculate shipping
    let shipping = 5000; // Base shipping
    if (finalSubtotal > 100000) {
      shipping = 0; // Free shipping over PKR 100,000
    }

    const total = finalSubtotal + tax + shipping;

    const pricingBreakdown = {
      baseTotal,
      totalQuantity,
      bulkDiscountPercent,
      bulkDiscount,
      companyDiscountPercent,
      companyDiscount,
      subtotal: finalSubtotal,
      tax,
      taxRate: 2,
      shipping,
      total,
      itemsWithPricing,
      savings: bulkDiscount + companyDiscount
    };

    return new Response(
      JSON.stringify({ data: pricingBreakdown }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
