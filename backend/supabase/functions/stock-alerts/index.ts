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
        const { product_id, current_stock, threshold } = await req.json();

        console.log(`Low stock alert: Product ${product_id} has ${current_stock} units (threshold: ${threshold})`);

        // In production, send email to admin/procurement team
        // For now, log the alert
        console.log({
            alert_type: 'low_stock',
            product_id,
            current_stock,
            threshold,
            timestamp: new Date().toISOString()
        });

        return new Response(JSON.stringify({
            data: {
                success: true,
                alert_sent: true,
                product_id
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({
            error: {
                code: 'ALERT_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
