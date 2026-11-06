Deno.serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        const { order_id, notification_type, customer_email, customer_phone } = await req.json();

        console.log(`Sending ${notification_type} notification for order ${order_id}`);

        // In production, integrate with email/SMS service
        // For now, log the notification
        console.log({
            order_id,
            notification_type,
            customer_email,
            customer_phone,
            timestamp: new Date().toISOString()
        });

        return new Response(JSON.stringify({
            data: {
                success: true,
                notification_sent: true,
                notification_type
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({
            error: {
                code: 'NOTIFICATION_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
