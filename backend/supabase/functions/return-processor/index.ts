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
        const { 
            order_id, 
            reason, 
            reason_category,
            return_type = 'refund',
            customer_notes,
            order_item_id
        } = await req.json();

        if (!order_id || !reason) {
            throw new Error('order_id and reason are required');
        }

        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        // Generate return number
        const return_number = `RET${Date.now()}${Math.floor(Math.random() * 1000)}`;

        // Create return request
        const returnResponse = await fetch(`${supabaseUrl}/rest/v1/returns`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                order_id,
                order_item_id: order_item_id || null,
                return_number,
                reason,
                reason_category: reason_category || 'other',
                status: 'requested',
                return_type,
                customer_notes: customer_notes || null
            })
        });

        if (!returnResponse.ok) {
            const error = await returnResponse.text();
            throw new Error(`Failed to create return: ${error}`);
        }

        const returnData = await returnResponse.json();

        // Notify admin about return request
        try {
            await fetch(`${supabaseUrl}/functions/v1/order-notifications`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    order_id,
                    notification_type: 'return_requested',
                    return_number
                })
            });
        } catch (notifyError) {
            console.log('Failed to send return notification:', notifyError);
        }

        return new Response(JSON.stringify({
            data: {
                success: true,
                return_number,
                return_id: returnData[0].id,
                status: 'requested'
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({
            error: {
                code: 'RETURN_REQUEST_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
