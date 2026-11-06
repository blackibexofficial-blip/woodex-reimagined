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
        const { order_id, action } = await req.json();

        if (!order_id) {
            throw new Error('order_id is required');
        }

        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        // Get order items
        const itemsResponse = await fetch(`${supabaseUrl}/rest/v1/order_items?order_id=eq.${order_id}&select=*`, {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            }
        });

        if (!itemsResponse.ok) {
            throw new Error('Failed to fetch order items');
        }

        const orderItems = await itemsResponse.json();

        for (const item of orderItems) {
            // Get current inventory
            const inventoryResponse = await fetch(`${supabaseUrl}/rest/v1/inventory?product_id=eq.${item.product_id}&select=*`, {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                }
            });

            const inventory = await inventoryResponse.json();
            if (inventory.length === 0) {
                console.log(`No inventory found for product ${item.product_id}`);
                continue;
            }

            const currentInventory = inventory[0];
            const quantity = item.quantity || 0;

            let updateData = {};
            let movementType = '';

            if (action === 'reserve') {
                // Reserve stock when order is placed
                updateData = {
                    stock_quantity: Math.max(0, currentInventory.stock_quantity - quantity),
                    last_updated: new Date().toISOString()
                };
                movementType = 'outbound';
            } else if (action === 'release') {
                // Release stock when order is cancelled
                updateData = {
                    stock_quantity: currentInventory.stock_quantity + quantity,
                    last_updated: new Date().toISOString()
                };
                movementType = 'inbound';
            } else if (action === 'confirm') {
                // Confirm stock deduction when order is confirmed
                movementType = 'outbound';
            }

            // Update inventory
            const updateResponse = await fetch(`${supabaseUrl}/rest/v1/inventory?product_id=eq.${item.product_id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });

            if (!updateResponse.ok) {
                console.log(`Failed to update inventory for product ${item.product_id}`);
            }

            // Record stock movement
            if (movementType) {
                await fetch(`${supabaseUrl}/rest/v1/stock_movements`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        product_id: item.product_id,
                        movement_type: movementType,
                        quantity: action === 'reserve' ? -quantity : quantity,
                        reference_id: order_id,
                        reference_type: 'order',
                        notes: `Order ${action}: ${order_id}`
                    })
                });
            }

            // Check if stock is low
            if (currentInventory.stock_quantity - quantity <= currentInventory.low_stock_threshold) {
                try {
                    await fetch(`${supabaseUrl}/functions/v1/stock-alerts`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            product_id: item.product_id,
                            current_stock: currentInventory.stock_quantity - quantity,
                            threshold: currentInventory.low_stock_threshold
                        })
                    });
                } catch (alertError) {
                    console.log('Failed to send stock alert:', alertError);
                }
            }
        }

        return new Response(JSON.stringify({
            data: {
                success: true,
                order_id,
                action,
                items_processed: orderItems.length
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({
            error: {
                code: 'INVENTORY_UPDATE_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
