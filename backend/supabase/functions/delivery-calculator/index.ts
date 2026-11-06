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
        const { postal_code, city, delivery_type = 'standard', cart_total = 0 } = await req.json();

        if (!postal_code && !city) {
            throw new Error('Either postal_code or city is required');
        }

        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        // Build query to find delivery zone
        let query = `${supabaseUrl}/rest/v1/delivery_zones?is_active=eq.true`;
        
        if (postal_code) {
            query += `&postal_codes=cs.{${postal_code}}`;
        } else if (city) {
            query += `&city=ilike.${encodeURIComponent(city)}`;
        }

        const zoneResponse = await fetch(query, {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            }
        });

        if (!zoneResponse.ok) {
            throw new Error('Failed to fetch delivery zones');
        }

        const zones = await zoneResponse.json();
        
        if (zones.length === 0) {
            // Default delivery cost if zone not found
            return new Response(JSON.stringify({
                data: {
                    delivery_cost: 2500,
                    delivery_type,
                    estimated_days: 5,
                    zone: 'Default',
                    free_delivery: false
                }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const zone = zones[0];
        let delivery_cost = 0;
        let estimated_days = 0;

        // Calculate delivery cost based on type
        switch (delivery_type) {
            case 'standard':
                delivery_cost = parseFloat(zone.base_delivery_cost);
                estimated_days = zone.estimated_delivery_days;
                break;
            case 'express':
                delivery_cost = parseFloat(zone.express_delivery_cost);
                estimated_days = zone.express_delivery_days;
                break;
            case 'same_day':
                delivery_cost = parseFloat(zone.same_day_delivery_cost);
                estimated_days = 1;
                break;
            default:
                delivery_cost = parseFloat(zone.base_delivery_cost);
                estimated_days = zone.estimated_delivery_days;
        }

        // Free delivery for orders above 100,000 PKR
        const free_delivery = cart_total >= 100000;
        if (free_delivery) {
            delivery_cost = 0;
        }

        return new Response(JSON.stringify({
            data: {
                delivery_cost,
                delivery_type,
                estimated_days,
                zone: zone.zone_name,
                city: zone.city,
                free_delivery,
                original_cost: parseFloat(zone.base_delivery_cost)
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({
            error: {
                code: 'DELIVERY_CALCULATION_FAILED',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
