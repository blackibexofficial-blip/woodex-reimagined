Deno.serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'false'
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        const { 
            amount, 
            currency = 'pkr', 
            cartItems, 
            customerEmail, 
            customerName,
            customerPhone,
            shippingAddress 
        } = await req.json();

        console.log('Payment intent request received:', { amount, currency, cartItemsCount: cartItems?.length });

        // Validate required parameters
        if (!amount || amount <= 0) {
            throw new Error('Valid amount is required');
        }

        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            throw new Error('Cart items are required');
        }

        if (!customerEmail || !customerName) {
            throw new Error('Customer email and name are required');
        }

        // Validate cart items structure
        for (const item of cartItems) {
            if (!item.product_id || !item.quantity || !item.price || !item.name) {
                throw new Error('Each cart item must have product_id, quantity, price, and name');
            }
            if (item.quantity <= 0 || item.price <= 0) {
                throw new Error('Cart item quantity and price must be positive');
            }
        }

        // Get environment variables
        const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!stripeSecretKey) {
            console.error('Stripe secret key not found in environment');
            throw new Error('Stripe secret key not configured');
        }

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        console.log('Environment variables validated');

        // Calculate total from cart items to verify
        const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shippingFee = subtotal > 100000 ? 0 : 2000;
        const tax = subtotal * 0.02;
        const calculatedTotal = subtotal + shippingFee + tax;

        if (Math.abs(calculatedTotal - amount) > 1) {
            throw new Error('Amount mismatch: calculated total does not match provided amount');
        }

        // Get or create customer
        let customerId = null;
        
        // Check if customer exists
        const customerCheckResponse = await fetch(
            `${supabaseUrl}/rest/v1/customers?email=eq.${encodeURIComponent(customerEmail)}&select=id`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (customerCheckResponse.ok) {
            const existingCustomers = await customerCheckResponse.json();
            if (existingCustomers.length > 0) {
                customerId = existingCustomers[0].id;
                console.log('Existing customer found:', customerId);
            }
        }

        // Create customer if not exists
        if (!customerId) {
            const customerData = {
                full_name: customerName,
                email: customerEmail,
                phone: customerPhone || null,
                customer_type: 'retail',
                status: 'active'
            };

            const customerResponse = await fetch(`${supabaseUrl}/rest/v1/customers`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(customerData)
            });

            if (customerResponse.ok) {
                const customer = await customerResponse.json();
                customerId = customer[0].id;
                console.log('New customer created:', customerId);
            } else {
                console.error('Failed to create customer');
            }
        }

        // Prepare Stripe payment intent data
        const stripeParams = new URLSearchParams();
        stripeParams.append('amount', Math.round(amount).toString()); // PKR doesn't use cents
        stripeParams.append('currency', currency);
        stripeParams.append('payment_method_types[]', 'card');
        stripeParams.append('metadata[customer_email]', customerEmail);
        stripeParams.append('metadata[customer_name]', customerName);
        stripeParams.append('metadata[cart_items_count]', cartItems.length.toString());
        stripeParams.append('metadata[total_items]', cartItems.reduce((sum, item) => sum + item.quantity, 0).toString());

        // Create payment intent with Stripe
        console.log('Creating Stripe payment intent...');
        const stripeResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${stripeSecretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: stripeParams.toString()
        });

        if (!stripeResponse.ok) {
            const errorData = await stripeResponse.text();
            console.error('Stripe API error:', errorData);
            throw new Error(`Stripe API error: ${errorData}`);
        }

        const paymentIntent = await stripeResponse.json();
        console.log('Payment intent created:', paymentIntent.id);

        // Generate order number
        const orderNumber = `WF${Date.now()}${Math.floor(Math.random() * 1000)}`;

        // Create order record in database
        const orderData = {
            order_number: orderNumber,
            user_id: customerId,
            customer_name: customerName,
            customer_email: customerEmail,
            customer_phone: customerPhone || null,
            shipping_address: shippingAddress || {},
            status: 'pending',
            payment_status: 'pending',
            payment_method: 'credit_card',
            subtotal: subtotal,
            tax: tax,
            shipping_fee: shippingFee,
            total: amount,
            currency: currency.toUpperCase(),
            stripe_payment_id: paymentIntent.id,
            stripe_session_id: paymentIntent.id
        };

        console.log('Creating order in database...');

        const orderResponse = await fetch(`${supabaseUrl}/rest/v1/orders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(orderData)
        });

        if (!orderResponse.ok) {
            const errorText = await orderResponse.text();
            console.error('Failed to create order:', errorText);
            
            // Cancel payment intent if order creation fails
            try {
                await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntent.id}/cancel`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${stripeSecretKey}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });
                console.log('Payment intent cancelled');
            } catch (cancelError) {
                console.error('Failed to cancel payment intent:', cancelError);
            }
            
            throw new Error(`Failed to create order: ${errorText}`);
        }

        const order = await orderResponse.json();
        const orderId = order[0].id;
        console.log('Order created:', orderId);

        // Create order items
        const orderItems = cartItems.map(item => ({
            order_id: orderId,
            product_id: item.product_id,
            product_name: item.name,
            quantity: item.quantity,
            price: item.price,
            image_url: item.image || null
        }));

        const orderItemsResponse = await fetch(`${supabaseUrl}/rest/v1/order_items`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderItems)
        });

        if (!orderItemsResponse.ok) {
            const errorText = await orderItemsResponse.text();
            console.error('Failed to create order items:', errorText);
        } else {
            console.log('Order items created successfully');
        }

        const result = {
            data: {
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
                orderId: orderId,
                orderNumber: orderNumber,
                amount: amount,
                currency: currency,
                status: 'pending'
            }
        };

        console.log('Payment intent creation completed successfully');

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Payment intent creation error:', error);

        const errorResponse = {
            error: {
                code: 'PAYMENT_INTENT_FAILED',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
