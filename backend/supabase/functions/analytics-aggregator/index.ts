Deno.serve(async (_req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'false'
    };

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        const today = new Date().toISOString().split('T')[0];
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterday = yesterdayDate.toISOString().split('T')[0];

        // 1. Count messages sent yesterday
        const messagesSentResponse = await fetch(
            `${supabaseUrl}/rest/v1/whatsapp_messages?direction=eq.outgoing&created_at=gte.${yesterday}T00:00:00&created_at=lt.${today}T00:00:00&select=id`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Range': '0-0',
                    'Prefer': 'count=exact'
                }
            }
        );
        const messagesSent = parseInt(messagesSentResponse.headers.get('content-range')?.split('/')[1] || '0');

        // 2. Count messages received yesterday
        const messagesReceivedResponse = await fetch(
            `${supabaseUrl}/rest/v1/whatsapp_messages?direction=eq.incoming&created_at=gte.${yesterday}T00:00:00&created_at=lt.${today}T00:00:00&select=id`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Range': '0-0',
                    'Prefer': 'count=exact'
                }
            }
        );
        const messagesReceived = parseInt(messagesReceivedResponse.headers.get('content-range')?.split('/')[1] || '0');

        // 3. Count leads generated yesterday
        const leadsResponse = await fetch(
            `${supabaseUrl}/rest/v1/customers?created_at=gte.${yesterday}T00:00:00&created_at=lt.${today}T00:00:00&select=id`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Range': '0-0',
                    'Prefer': 'count=exact'
                }
            }
        );
        const leadsGenerated = parseInt(leadsResponse.headers.get('content-range')?.split('/')[1] || '0');

        // 4. Count quotations created yesterday
        const quotationsResponse = await fetch(
            `${supabaseUrl}/rest/v1/quotations?created_at=gte.${yesterday}T00:00:00&created_at=lt.${today}T00:00:00&select=id`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Range': '0-0',
                    'Prefer': 'count=exact'
                }
            }
        );
        const quotationsCreated = parseInt(quotationsResponse.headers.get('content-range')?.split('/')[1] || '0');

        // 5. Count quotations accepted yesterday
        const quotationsAcceptedResponse = await fetch(
            `${supabaseUrl}/rest/v1/quotations?status=eq.accepted&updated_at=gte.${yesterday}T00:00:00&updated_at=lt.${today}T00:00:00&select=id`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Range': '0-0',
                    'Prefer': 'count=exact'
                }
            }
        );
        const quotationsAccepted = parseInt(quotationsAcceptedResponse.headers.get('content-range')?.split('/')[1] || '0');

        // 6. Count orders created yesterday
        const ordersResponse = await fetch(
            `${supabaseUrl}/rest/v1/orders?created_at=gte.${yesterday}T00:00:00&created_at=lt.${today}T00:00:00&select=id`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Range': '0-0',
                    'Prefer': 'count=exact'
                }
            }
        );
        const ordersCreated = parseInt(ordersResponse.headers.get('content-range')?.split('/')[1] || '0');

        // 7. Calculate revenue from yesterday's orders
        const revenueResponse = await fetch(
            `${supabaseUrl}/rest/v1/orders?created_at=gte.${yesterday}T00:00:00&created_at=lt.${today}T00:00:00&select=total`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );
        const orders = await revenueResponse.json();
        const revenue = orders.reduce((sum: number, order: any) => sum + parseFloat(order.total || 0), 0);

        // 8. Count active users
        const activeUsersResponse = await fetch(
            `${supabaseUrl}/rest/v1/profiles?select=id`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Range': '0-0',
                    'Prefer': 'count=exact'
                }
            }
        );
        const activeUsers = parseInt(activeUsersResponse.headers.get('content-range')?.split('/')[1] || '0');

        // 9. Upsert analytics data
        const analyticsData = {
            date: yesterday,
            messages_sent: messagesSent,
            messages_received: messagesReceived,
            leads_generated: leadsGenerated,
            quotations_created: quotationsCreated,
            quotations_accepted: quotationsAccepted,
            orders_created: ordersCreated,
            revenue: revenue,
            active_users: activeUsers
        };

        const upsertResponse = await fetch(
            `${supabaseUrl}/rest/v1/analytics_daily`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify(analyticsData)
            }
        );

        if (!upsertResponse.ok) {
            throw new Error(`Failed to upsert analytics: ${await upsertResponse.text()}`);
        }

        console.log(`Analytics aggregated for ${yesterday}:`, analyticsData);

        return new Response(JSON.stringify({
            data: {
                date: yesterday,
                ...analyticsData,
                message: 'Analytics aggregated successfully'
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Analytics aggregator error:', error);

        const errorResponse = {
            error: {
                code: 'ANALYTICS_AGGREGATION_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
