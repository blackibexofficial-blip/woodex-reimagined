// WoodEx Quotation Calculator Edge Function
// Handles real-time pricing with bulk discounts, customizations, and room packages

Deno.serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'false'
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        const {items, customerId, customerTier = 'standard'} = await req.json();

        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new Error('Items array is required');
        }

        // Get service role key for database access
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Calculate totals for each item
        const calculatedItems = [];
        let subtotal = 0;

        for (const item of items) {
            const {productId, productName, quantity, unitPrice, customizations = {}} = item;

            let itemSubtotal = unitPrice * quantity;
            let discountPercentage = 0;
            let customizationPremium = 0;

            // Apply bulk discount based on quantity tiers
            if (quantity >= 51) {
                discountPercentage = 15;
            } else if (quantity >= 21) {
                discountPercentage = 10;
            } else if (quantity >= 6) {
                discountPercentage = 5;
            }

            // Calculate customization premiums
            if (customizations.material) {
                if (customizations.material === 'premium_leather') {
                    customizationPremium += unitPrice * 0.25; // 25% premium
                } else if (customizations.material === 'high_grade_wood') {
                    customizationPremium += unitPrice * 0.20; // 20% premium
                } else if (customizations.material === 'fabric_upgrade') {
                    customizationPremium += unitPrice * 0.10; // 10% premium
                }
            }

            if (customizations.color && customizations.color !== 'standard') {
                customizationPremium += unitPrice * 0.10; // 10% premium for custom colors
            }

            if (customizations.size && customizations.size !== 'standard') {
                if (customizations.size === 'executive') {
                    customizationPremium += unitPrice * 0.30; // 30% premium
                } else if (customizations.size === 'large') {
                    customizationPremium += unitPrice * 0.20; // 20% premium
                } else if (customizations.size === 'custom') {
                    customizationPremium += unitPrice * 0.25; // 25% premium
                }
            }

            // Add customization premium to unit price
            const adjustedUnitPrice = unitPrice + customizationPremium;
            const adjustedSubtotal = adjustedUnitPrice * quantity;

            // Calculate discount
            const discountAmount = (adjustedSubtotal * discountPercentage) / 100;
            const totalPrice = adjustedSubtotal - discountAmount;

            calculatedItems.push({
                productId,
                productName,
                quantity,
                unitPrice: adjustedUnitPrice.toFixed(2),
                subtotal: adjustedSubtotal.toFixed(2),
                discountPercentage,
                discountAmount: discountAmount.toFixed(2),
                totalPrice: totalPrice.toFixed(2),
                customizations,
                customizationPremium: customizationPremium.toFixed(2)
            });

            subtotal += parseFloat(totalPrice.toFixed(2));
        }

        // Calculate total quantities for overall bulk discount
        const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
        let orderLevelDiscount = 0;

        // Apply additional order-level bulk discount
        if (totalQuantity >= 100) {
            orderLevelDiscount = subtotal * 0.05; // Additional 5% for orders over 100 items
        }

        // Customer tier discount
        let tierDiscount = 0;
        if (customerTier === 'enterprise') {
            tierDiscount = subtotal * 0.08; // 8% for enterprise customers
        } else if (customerTier === 'premium') {
            tierDiscount = subtotal * 0.05; // 5% for premium customers
        }

        // Calculate final totals
        const totalDiscount = orderLevelDiscount + tierDiscount;
        const subtotalAfterDiscount = subtotal - totalDiscount;
        
        // Pakistan tax rate (17% GST)
        const taxRate = 17.0;
        const taxAmount = (subtotalAfterDiscount * taxRate) / 100;
        
        // Shipping calculation
        let shippingCost = 0;
        if (subtotalAfterDiscount < 100000) {
            shippingCost = 2500; // PKR 2,500 for orders under PKR 100,000
        } else if (subtotalAfterDiscount < 500000) {
            shippingCost = 5000; // PKR 5,000 for orders under PKR 500,000
        }
        // Free shipping for orders over PKR 500,000

        const finalTotal = subtotalAfterDiscount + taxAmount + shippingCost;

        // Prepare response
        const quotationData = {
            items: calculatedItems,
            subtotal: subtotal.toFixed(2),
            orderLevelDiscount: orderLevelDiscount.toFixed(2),
            tierDiscount: tierDiscount.toFixed(2),
            totalDiscount: totalDiscount.toFixed(2),
            subtotalAfterDiscount: subtotalAfterDiscount.toFixed(2),
            taxRate: taxRate.toFixed(2),
            taxAmount: taxAmount.toFixed(2),
            shippingCost: shippingCost.toFixed(2),
            finalTotal: finalTotal.toFixed(2),
            currency: 'PKR',
            totalQuantity,
            customerTier,
            calculatedAt: new Date().toISOString()
        };

        return new Response(JSON.stringify({data: quotationData}), {
            headers: {...corsHeaders, 'Content-Type': 'application/json'}
        });

    } catch (error) {
        console.error('Quotation calculation error:', error);

        const errorResponse = {
            error: {
                code: 'QUOTATION_CALCULATION_FAILED',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: {...corsHeaders, 'Content-Type': 'application/json'}
        });
    }
});
