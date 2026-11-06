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
        const { date } = await req.json();

        // Default to yesterday if no date provided
        const targetDate = date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Calculate date range
        const startDate = `${targetDate}T00:00:00Z`;
        const endDate = `${targetDate}T23:59:59Z`;

        // 1. Count total messages sent
        const sentMessagesResponse = await fetch(
            `${supabaseUrl}/rest/v1/whatsapp_messages?direction=eq.outbound&created_at=gte.${startDate}&created_at=lte.${endDate}&select=id`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );
        const sentMessages = await sentMessagesResponse.json();
        const totalMessagesSent = sentMessages?.length || 0;

        // 2. Count total messages received
        const receivedMessagesResponse = await fetch(
            `${supabaseUrl}/rest/v1/whatsapp_messages?direction=eq.inbound&created_at=gte.${startDate}&created_at=lte.${endDate}&select=id`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );
        const receivedMessages = await receivedMessagesResponse.json();
        const totalMessagesReceived = receivedMessages?.length || 0;

        // 3. Count total conversations
        const conversationsResponse = await fetch(
            `${supabaseUrl}/rest/v1/whatsapp_conversations?select=id,status,created_at,last_message_at`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );
        const conversations = await conversationsResponse.json();
        const totalConversations = conversations?.length || 0;

        // 4. Count active conversations (had activity on this date)
        const activeConversations = conversations?.filter(conv => {
            const lastMessageDate = new Date(conv.last_message_at).toISOString().split('T')[0];
            return lastMessageDate === targetDate;
        }).length || 0;

        // 5. Calculate response rate
        const responseRate = totalMessagesSent > 0 
            ? ((totalMessagesReceived / totalMessagesSent) * 100).toFixed(2)
            : 0;

        // 6. Calculate average response time
        let totalResponseTime = 0;
        let responseCount = 0;

        for (const inboundMsg of receivedMessages || []) {
            // Find the previous outbound message to this customer
            const outboundResponse = await fetch(
                `${supabaseUrl}/rest/v1/whatsapp_messages?customer_id=eq.${inboundMsg.customer_id}&direction=eq.outbound&created_at=lt.${inboundMsg.created_at}&order=created_at.desc&limit=1&select=created_at`,
                {
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey
                    }
                }
            );

            const outboundMessages = await outboundResponse.json();
            if (outboundMessages && outboundMessages.length > 0) {
                const outboundTime = new Date(outboundMessages[0].created_at).getTime();
                const inboundTime = new Date(inboundMsg.created_at).getTime();
                const responseTimeMs = inboundTime - outboundTime;
                totalResponseTime += responseTimeMs;
                responseCount++;
            }
        }

        const avgResponseTimeMinutes = responseCount > 0
            ? Math.round(totalResponseTime / responseCount / 1000 / 60)
            : 0;

        // 7. Count conversions (quotes approved or orders placed)
        const quotationsResponse = await fetch(
            `${supabaseUrl}/rest/v1/quotations?status=eq.approved&updated_at=gte.${startDate}&updated_at=lte.${endDate}&select=id,total_amount`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );
        const quotations = await quotationsResponse.json();
        const conversionCount = quotations?.length || 0;

        // 8. Calculate revenue attributed to WhatsApp
        const revenueAttributed = quotations?.reduce((sum, quote) => {
            return sum + parseFloat(quote.total_amount || 0);
        }, 0) || 0;

        // Check if record exists for this date
        const existingResponse = await fetch(
            `${supabaseUrl}/rest/v1/whatsapp_analytics?metric_date=eq.${targetDate}&select=id`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        const existing = await existingResponse.json();

        // Prepare analytics data
        const analyticsData = {
            metric_date: targetDate,
            total_messages_sent: totalMessagesSent,
            total_messages_received: totalMessagesReceived,
            total_conversations: totalConversations,
            active_conversations: activeConversations,
            response_rate: parseFloat(responseRate),
            avg_response_time_minutes: avgResponseTimeMinutes,
            conversion_count: conversionCount,
            revenue_attributed: revenueAttributed
        };

        // Update or insert
        if (existing && existing.length > 0) {
            // Update existing record
            await fetch(`${supabaseUrl}/rest/v1/whatsapp_analytics?id=eq.${existing[0].id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(analyticsData)
            });
        } else {
            // Insert new record
            await fetch(`${supabaseUrl}/rest/v1/whatsapp_analytics`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(analyticsData)
            });
        }

        return new Response(JSON.stringify({
            data: {
                success: true,
                date: targetDate,
                metrics: analyticsData
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Analytics aggregation error:', error);

        const errorResponse = {
            error: {
                code: 'ANALYTICS_AGGREGATION_FAILED',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
