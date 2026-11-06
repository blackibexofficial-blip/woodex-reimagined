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
        const { trigger_type, customer_id, data } = await req.json();

        if (!trigger_type || !customer_id) {
            throw new Error('trigger_type and customer_id are required');
        }

        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Fetch customer details
        const customerResponse = await fetch(`${supabaseUrl}/rest/v1/customers?id=eq.${customer_id}&select=*`, {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            }
        });

        if (!customerResponse.ok) {
            throw new Error('Failed to fetch customer details');
        }

        const customers = await customerResponse.json();
        if (!customers || customers.length === 0) {
            throw new Error('Customer not found');
        }

        const customer = customers[0];
        const phoneNumber = customer.phone || customer.whatsapp_number;

        if (!phoneNumber) {
            throw new Error('Customer phone number not found');
        }

        // Get or create conversation
        let conversationId;
        const convResponse = await fetch(`${supabaseUrl}/rest/v1/whatsapp_conversations?customer_id=eq.${customer_id}&select=*`, {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey
            }
        });

        const conversations = await convResponse.json();
        
        if (conversations && conversations.length > 0) {
            conversationId = conversations[0].id;
        } else {
            // Create new conversation
            const createConvResponse = await fetch(`${supabaseUrl}/rest/v1/whatsapp_conversations`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                    customer_id: customer_id,
                    whatsapp_number: phoneNumber,
                    status: 'active',
                    customer_stage: 'prospect'
                })
            });

            const newConv = await createConvResponse.json();
            conversationId = newConv[0].id;
        }

        // Generate message based on trigger type
        let messageContent = '';
        let messageData = {};

        switch (trigger_type) {
            case 'cart_addition':
                messageContent = `Thanks ${customer.name || 'valued customer'}! You added ${data.product_name} to your cart. Need help with quantity? Reply 'HELP'`;
                messageData = { product_id: data.product_id, product_name: data.product_name };
                break;

            case 'cart_abandonment_1h':
                messageContent = `Still considering ${data.product_name}? Get 5% off on orders of 6+ items! Complete your order: ${data.cart_link}`;
                messageData = { cart_id: data.cart_id, discount: '5%' };
                break;

            case 'cart_abandonment_24h':
                messageContent = `Your cart is waiting! Need assistance? Call us at +92-300-1234567 or reply 'QUOTE' for a custom quote.`;
                messageData = { cart_id: data.cart_id };
                break;

            case 'quote_created':
                messageContent = `Your quote #${data.quote_number} is ready! PDF: ${data.pdf_link}. Valid for 30 days. Questions? Reply 'HELP'`;
                messageData = { quote_id: data.quote_id, quote_number: data.quote_number };
                break;

            case 'quote_viewed':
                messageContent = `Great! You've reviewed your quote #${data.quote_number}. Questions? Reply 'HELP' or call us!`;
                messageData = { quote_id: data.quote_id };
                break;

            case 'quote_expiring_7d':
                messageContent = `Your quote #${data.quote_number} expires in 7 days. Extend it? Reply 'EXTEND'`;
                messageData = { quote_id: data.quote_id };
                break;

            case 'quote_expiring_1d':
                messageContent = `Last day! Your quote #${data.quote_number} expires tomorrow. Ready to proceed? Reply 'APPROVE'`;
                messageData = { quote_id: data.quote_id };
                break;

            case 'order_confirmed':
                messageContent = `Order #${data.order_number} confirmed! Tracking: ${data.tracking_link}. Expected delivery: ${data.delivery_date}`;
                messageData = { order_id: data.order_id, order_number: data.order_number };
                break;

            case 'order_shipped':
                messageContent = `Your order #${data.order_number} is on the way! Track: ${data.tracking_link}. Delivery contact: ${data.delivery_phone}`;
                messageData = { order_id: data.order_id };
                break;

            case 'order_delivered':
                messageContent = `Delivered! How was your experience with order #${data.order_number}? Leave a review: ${data.review_link}`;
                messageData = { order_id: data.order_id };
                break;

            default:
                messageContent = `Thank you for choosing WoodEx Furniture! We're here to help. Reply 'HELP' for assistance.`;
        }

        // Send WhatsApp message using existing engine
        const whatsappEngineUrl = `${supabaseUrl}/functions/v1/whatsapp-message-handler`;
        const whatsappResponse = await fetch(whatsappEngineUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phone_number: phoneNumber,
                message: messageContent,
                trigger_type: trigger_type
            })
        });

        const whatsappResult = await whatsappResponse.json();

        // Log message in database
        const logResponse = await fetch(`${supabaseUrl}/rest/v1/whatsapp_messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                customer_id: customer_id,
                phone_number: phoneNumber,
                direction: 'outbound',
                message_type: 'text',
                content: messageContent,
                status: 'sent',
                automation_triggered: true
            })
        });

        // Update conversation
        await fetch(`${supabaseUrl}/rest/v1/whatsapp_conversations?id=eq.${conversationId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                last_message_at: new Date().toISOString(),
                total_messages: conversations[0]?.total_messages + 1 || 1,
                updated_at: new Date().toISOString()
            })
        });

        return new Response(JSON.stringify({
            data: {
                success: true,
                message: 'WhatsApp message sent successfully',
                conversation_id: conversationId,
                trigger_type: trigger_type,
                whatsapp_result: whatsappResult
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('WhatsApp CRM trigger error:', error);

        const errorResponse = {
            error: {
                code: 'WHATSAPP_TRIGGER_FAILED',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
