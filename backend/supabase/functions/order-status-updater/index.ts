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
        const { order_id, new_status, changed_by, change_reason, notes } = await req.json();

        if (!order_id || !new_status) {
            throw new Error('order_id and new_status are required');
        }

        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        // Get current order
        const orderResponse = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${order_id}&select=*`, {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            }
        });

        if (!orderResponse.ok) {
            throw new Error('Failed to fetch order');
        }

        const orders = await orderResponse.json();
        if (orders.length === 0) {
            throw new Error('Order not found');
        }

        const order = orders[0];
        const old_status = order.status;

        // Update order status
        const updateResponse = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${order_id}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                status: new_status,
                updated_at: new Date().toISOString(),
                ...(new_status === 'confirmed' && { confirmed_date: new Date().toISOString() }),
                ...(new_status === 'shipped' && { shipped_date: new Date().toISOString() }),
                ...(new_status === 'delivered' && { delivered_at: new Date().toISOString() })
            })
        });

        if (!updateResponse.ok) {
            const error = await updateResponse.text();
            throw new Error(`Failed to update order: ${error}`);
        }

        // Record status change in history
        const historyResponse = await fetch(`${supabaseUrl}/rest/v1/order_status_history`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                order_id,
                old_status,
                new_status,
                changed_by: changed_by || null,
                change_reason: change_reason || null,
                notes: notes || null
            })
        });

        if (!historyResponse.ok) {
            console.log('Failed to record status history');
        }

        // Send notification if order is shipped or delivered
        if (new_status === 'shipped' || new_status === 'delivered') {
            try {
                await fetch(`${supabaseUrl}/functions/v1/order-notifications`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        order_id,
                        notification_type: new_status,
                        customer_email: order.customer_email,
                        customer_phone: order.customer_phone
                    })
                });
            } catch (notifyError) {
                console.log('Failed to send notification:', notifyError);
            }
        }

        return new Response(JSON.stringify({
            data: {
                success: true,
                order_id,
                old_status,
                new_status
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({
            error: {
                code: 'ORDER_STATUS_UPDATE_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
