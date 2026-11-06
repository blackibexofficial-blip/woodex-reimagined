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
        const { phoneNumber, message, messageType, mediaUrl } = await req.json();

        if (!phoneNumber || !message) {
            throw new Error('Phone number and message are required');
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // 1. Find or create customer by phone number
        let customerId = null;
        
        // Check if customer exists
        const customerCheckResponse = await fetch(
            `${supabaseUrl}/rest/v1/customers?phone=eq.${encodeURIComponent(phoneNumber)}`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        const existingCustomers = await customerCheckResponse.json();

        if (existingCustomers && existingCustomers.length > 0) {
            customerId = existingCustomers[0].id;
        } else {
            // Create new customer as lead
            const newCustomerResponse = await fetch(
                `${supabaseUrl}/rest/v1/customers`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({
                        full_name: `Customer ${phoneNumber}`,
                        phone: phoneNumber,
                        whatsapp_number: phoneNumber,
                        status: 'lead',
                        lead_source: 'whatsapp',
                        lead_score: 50
                    })
                }
            );

            const newCustomer = await newCustomerResponse.json();
            customerId = newCustomer[0]?.id;
        }

        // 2. Store the message
        const messageData = {
            customer_id: customerId,
            phone_number: phoneNumber,
            direction: 'incoming',
            message_type: messageType || 'text',
            content: message,
            media_url: mediaUrl,
            status: 'received',
            automation_triggered: false
        };

        const messageResponse = await fetch(
            `${supabaseUrl}/rest/v1/whatsapp_messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(messageData)
            }
        );

        const savedMessage = await messageResponse.json();

        // 3. Check for automation rules
        const rulesResponse = await fetch(
            `${supabaseUrl}/rest/v1/whatsapp_automation_rules?is_active=eq.true&trigger_type=eq.keyword`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        const automationRules = await rulesResponse.json();
        let automatedResponse = null;

        // Check if message matches any automation rules
        const messageLower = message.toLowerCase();
        for (const rule of automationRules || []) {
            if (messageLower.includes(rule.trigger_value.toLowerCase())) {
                // Execute automation action
                if (rule.action_type === 'send_template') {
                    const templateId = rule.action_config.template_id;
                    
                    // Fetch template
                    const templateResponse = await fetch(
                        `${supabaseUrl}/rest/v1/whatsapp_templates?id=eq.${templateId}`,
                        {
                            headers: {
                                'Authorization': `Bearer ${serviceRoleKey}`,
                                'apikey': serviceRoleKey
                            }
                        }
                    );
                    
                    const templates = await templateResponse.json();
                    if (templates && templates.length > 0) {
                        automatedResponse = templates[0].content;
                        
                        // Log automated response
                        await fetch(
                            `${supabaseUrl}/rest/v1/whatsapp_messages`,
                            {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${serviceRoleKey}`,
                                    'apikey': serviceRoleKey,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    customer_id: customerId,
                                    phone_number: phoneNumber,
                                    direction: 'outgoing',
                                    message_type: 'text',
                                    content: automatedResponse,
                                    status: 'pending',
                                    automation_triggered: true,
                                    response_to: savedMessage[0]?.id
                                })
                            }
                        );
                        
                        break;
                    }
                }
            }
        }

        return new Response(JSON.stringify({
            data: {
                messageId: savedMessage[0]?.id,
                customerId,
                automatedResponse
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('WhatsApp message handler error:', error);

        const errorResponse = {
            error: {
                code: 'MESSAGE_HANDLER_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
