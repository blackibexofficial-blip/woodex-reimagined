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
        const { customer_id, event_type, event_data, page_url, session_id } = await req.json();

        if (!event_type) {
            throw new Error('event_type is required');
        }

        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Extract metadata from request
        const userAgent = req.headers.get('user-agent') || '';
        const referrer = req.headers.get('referer') || '';
        const forwardedFor = req.headers.get('x-forwarded-for') || '';
        const ipAddress = forwardedFor.split(',')[0].trim() || '';

        // Log journey event
        const eventResponse = await fetch(`${supabaseUrl}/rest/v1/customer_journey_events`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                customer_id: customer_id || null,
                session_id: session_id || null,
                event_type: event_type,
                event_data: event_data || {},
                page_url: page_url || '',
                referrer_url: referrer,
                user_agent: userAgent,
                ip_address: ipAddress || null,
                timestamp: new Date().toISOString()
            })
        });

        if (!eventResponse.ok) {
            const errorText = await eventResponse.text();
            throw new Error(`Failed to log journey event: ${errorText}`);
        }

        const eventResult = await eventResponse.json();

        // Update lead score based on event type
        if (customer_id) {
            let scoreChange = 0;
            
            switch (event_type) {
                case 'product_view':
                    scoreChange = 1;
                    break;
                case 'cart_addition':
                    scoreChange = 5;
                    break;
                case 'quote_request':
                    scoreChange = 10;
                    break;
                case 'quote_view':
                    scoreChange = 3;
                    break;
                case 'showroom_booking':
                    scoreChange = 15;
                    break;
                case 'customization_started':
                    scoreChange = 8;
                    break;
                case 'product_search':
                    scoreChange = 2;
                    break;
                default:
                    scoreChange = 1;
            }

            // Update conversation lead score
            const convResponse = await fetch(`${supabaseUrl}/rest/v1/whatsapp_conversations?customer_id=eq.${customer_id}&select=*`, {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            });

            const conversations = await convResponse.json();
            
            if (conversations && conversations.length > 0) {
                const currentScore = conversations[0].lead_score || 0;
                const newScore = currentScore + scoreChange;

                await fetch(`${supabaseUrl}/rest/v1/whatsapp_conversations?id=eq.${conversations[0].id}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        lead_score: newScore,
                        updated_at: new Date().toISOString()
                    })
                });
            }
        }

        // Trigger automated WhatsApp messages based on specific events
        const triggerEvents = [
            'cart_addition',
            'quote_request',
            'showroom_booking',
            'order_confirmed'
        ];

        if (customer_id && triggerEvents.includes(event_type)) {
            const triggerUrl = `${supabaseUrl}/functions/v1/whatsapp-crm-trigger`;
            
            await fetch(triggerUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    trigger_type: event_type,
                    customer_id: customer_id,
                    data: event_data || {}
                })
            });
        }

        return new Response(JSON.stringify({
            data: {
                success: true,
                event_id: eventResult[0]?.id,
                event_type: event_type,
                score_updated: customer_id ? true : false
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Journey tracking error:', error);

        const errorResponse = {
            error: {
                code: 'JOURNEY_TRACKING_FAILED',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
