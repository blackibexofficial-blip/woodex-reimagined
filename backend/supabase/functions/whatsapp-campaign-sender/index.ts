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
        const { campaign_id } = await req.json();

        if (!campaign_id) {
            throw new Error('campaign_id is required');
        }

        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Fetch campaign details
        const campaignResponse = await fetch(`${supabaseUrl}/rest/v1/whatsapp_campaigns?id=eq.${campaign_id}&select=*`, {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey
            }
        });

        if (!campaignResponse.ok) {
            throw new Error('Failed to fetch campaign details');
        }

        const campaigns = await campaignResponse.json();
        if (!campaigns || campaigns.length === 0) {
            throw new Error('Campaign not found');
        }

        const campaign = campaigns[0];

        if (campaign.status !== 'scheduled' && campaign.status !== 'draft') {
            throw new Error('Campaign is not in scheduled or draft status');
        }

        // Build customer query based on target segment
        const segment = campaign.target_segment || {};
        let customerQuery = `${supabaseUrl}/rest/v1/customers?select=id,name,phone,email`;

        // Apply segment filters
        if (segment.customer_tier) {
            customerQuery += `&tier=eq.${segment.customer_tier}`;
        }
        if (segment.min_purchase_value) {
            customerQuery += `&total_purchase_value=gte.${segment.min_purchase_value}`;
        }
        if (segment.city) {
            customerQuery += `&city=eq.${segment.city}`;
        }
        if (segment.last_purchase_days) {
            const daysAgo = new Date();
            daysAgo.setDate(daysAgo.getDate() - segment.last_purchase_days);
            customerQuery += `&last_purchase_date=gte.${daysAgo.toISOString()}`;
        }

        // Fetch target customers
        const customersResponse = await fetch(customerQuery, {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey
            }
        });

        if (!customersResponse.ok) {
            throw new Error('Failed to fetch target customers');
        }

        const customers = await customersResponse.json();

        if (!customers || customers.length === 0) {
            throw new Error('No customers found matching the target segment');
        }

        // Update campaign status to sending
        await fetch(`${supabaseUrl}/rest/v1/whatsapp_campaigns?id=eq.${campaign_id}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: 'sending',
                updated_at: new Date().toISOString()
            })
        });

        // Send messages to all customers
        let sentCount = 0;
        let deliveredCount = 0;
        const whatsappEngineUrl = `${supabaseUrl}/functions/v1/whatsapp-message-handler`;

        for (const customer of customers) {
            if (!customer.phone) {
                continue;
            }

            // Personalize message
            let personalizedMessage = campaign.message_content;
            personalizedMessage = personalizedMessage.replace(/\{name\}/g, customer.name || 'valued customer');
            personalizedMessage = personalizedMessage.replace(/\{email\}/g, customer.email || '');

            try {
                // Send WhatsApp message
                const whatsappResponse = await fetch(whatsappEngineUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        phone_number: customer.phone,
                        message: personalizedMessage,
                        trigger_type: 'campaign'
                    })
                });

                if (whatsappResponse.ok) {
                    sentCount++;
                    deliveredCount++;

                    // Log message
                    await fetch(`${supabaseUrl}/rest/v1/whatsapp_messages`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'apikey': serviceRoleKey,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            customer_id: customer.id,
                            phone_number: customer.phone,
                            direction: 'outbound',
                            message_type: 'text',
                            content: personalizedMessage,
                            status: 'sent',
                            automation_triggered: true
                        })
                    });
                }

                // Rate limiting: wait 100ms between messages
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
                console.error(`Failed to send message to ${customer.phone}:`, error);
            }
        }

        // Update campaign with final stats
        await fetch(`${supabaseUrl}/rest/v1/whatsapp_campaigns?id=eq.${campaign_id}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: 'completed',
                sent_count: sentCount,
                delivered_count: deliveredCount,
                updated_at: new Date().toISOString()
            })
        });

        return new Response(JSON.stringify({
            data: {
                success: true,
                campaign_id: campaign_id,
                target_customers: customers.length,
                messages_sent: sentCount,
                messages_delivered: deliveredCount
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Campaign sending error:', error);

        const errorResponse = {
            error: {
                code: 'CAMPAIGN_SEND_FAILED',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
