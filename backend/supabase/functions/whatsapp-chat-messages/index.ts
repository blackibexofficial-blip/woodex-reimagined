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
        const { 
            action,
            customer_id, 
            message_content,
            message_id,
            conversation_id,
            limit
        } = await req.json();

        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Action: Send Message (from customer)
        if (action === 'send_message') {
            if (!customer_id || !message_content) {
                throw new Error('customer_id and message_content are required');
            }

            // Fetch customer details
            const customerResponse = await fetch(`${supabaseUrl}/rest/v1/customers?id=eq.${customer_id}&select=*`, {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            });

            if (!customerResponse.ok) {
                throw new Error('Failed to fetch customer details');
            }

            const customers = await customerResponse.json();
            if (!customers || customers.length === 0) {
                throw new Error('Customer not found');
            }

            const customer = customers[0];
            const phoneNumber = customer.phone || customer.whatsapp_number;

            // Get or create conversation
            let conversationId;
            const convResponse = await fetch(`${supabaseUrl}/rest/v1/whatsapp_conversations?customer_id=eq.${customer_id}&select=*`, {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            });

            const conversations = await convResponse.json();
            
            if (conversations && conversations.length > 0) {
                conversationId = conversations[0].id;
            } else {
                // Create new conversation
                const createConvResponse = await fetch(`${supabaseUrl}/rest/v1/whatsapp_conversations`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({
                        customer_id: customer_id,
                        whatsapp_number: phoneNumber,
                        status: 'active',
                        customer_stage: 'prospect',
                        lead_score: 5
                    })
                });

                const newConv = await createConvResponse.json();
                conversationId = newConv[0].id;
            }

            // Save message to database
            const messageData = {
                customer_id: customer_id,
                phone_number: phoneNumber,
                direction: 'inbound',
                message_type: 'text',
                content: message_content,
                status: 'received',
                automation_triggered: false,
                created_at: new Date().toISOString()
            };

            const messageResponse = await fetch(`${supabaseUrl}/rest/v1/whatsapp_messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(messageData)
            });

            if (!messageResponse.ok) {
                const errorText = await messageResponse.text();
                throw new Error(`Failed to save message: ${errorText}`);
            }

            const savedMessage = await messageResponse.json();

            // Update conversation
            await fetch(`${supabaseUrl}/rest/v1/whatsapp_conversations?id=eq.${conversationId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    last_message_at: new Date().toISOString(),
                    total_messages: (conversations[0]?.total_messages || 0) + 1,
                    lead_score: (conversations[0]?.lead_score || 0) + 2,
                    updated_at: new Date().toISOString()
                })
            });

            // Send auto-acknowledgment
            const autoReply = "Thank you for your message! A WoodEx team member will respond shortly. For urgent inquiries, call +92-300-1234567.";
            
            const autoReplyData = {
                customer_id: customer_id,
                phone_number: phoneNumber,
                direction: 'outbound',
                message_type: 'text',
                content: autoReply,
                status: 'sent',
                automation_triggered: true,
                response_to: savedMessage[0].id,
                created_at: new Date().toISOString()
            };

            await fetch(`${supabaseUrl}/rest/v1/whatsapp_messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(autoReplyData)
            });

            return new Response(JSON.stringify({
                data: {
                    success: true,
                    message: savedMessage[0],
                    conversation_id: conversationId,
                    auto_reply: autoReply
                }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Action: Get Messages (for conversation history)
        if (action === 'get_messages') {
            if (!conversation_id && !customer_id) {
                throw new Error('conversation_id or customer_id is required');
            }

            let query = `${supabaseUrl}/rest/v1/whatsapp_messages?`;
            
            if (conversation_id) {
                // Need to join with conversations to filter by conversation_id
                // For now, filter by customer_id
                const convResponse = await fetch(`${supabaseUrl}/rest/v1/whatsapp_conversations?id=eq.${conversation_id}&select=customer_id`, {
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey
                    }
                });
                const conv = await convResponse.json();
                if (conv && conv.length > 0) {
                    query += `customer_id=eq.${conv[0].customer_id}&`;
                }
            } else {
                query += `customer_id=eq.${customer_id}&`;
            }

            query += `select=*&order=created_at.asc`;
            
            if (limit) {
                query += `&limit=${limit}`;
            }

            const messagesResponse = await fetch(query, {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            });

            if (!messagesResponse.ok) {
                throw new Error('Failed to fetch messages');
            }

            const messages = await messagesResponse.json();

            return new Response(JSON.stringify({
                data: {
                    messages: messages,
                    count: messages.length
                }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Action: Send Reply (from admin)
        if (action === 'send_reply') {
            if (!customer_id || !message_content) {
                throw new Error('customer_id and message_content are required');
            }

            // Fetch customer details
            const customerResponse = await fetch(`${supabaseUrl}/rest/v1/customers?id=eq.${customer_id}&select=*`, {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            });

            const customers = await customerResponse.json();
            if (!customers || customers.length === 0) {
                throw new Error('Customer not found');
            }

            const customer = customers[0];
            const phoneNumber = customer.phone || customer.whatsapp_number;

            // Send WhatsApp message via engine
            const whatsappEngineUrl = `${supabaseUrl}/functions/v1/whatsapp-message-handler`;
            const whatsappResponse = await fetch(whatsappEngineUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    phone_number: phoneNumber,
                    message: message_content,
                    trigger_type: 'admin_reply'
                })
            });

            // Save message to database
            const messageData = {
                customer_id: customer_id,
                phone_number: phoneNumber,
                direction: 'outbound',
                message_type: 'text',
                content: message_content,
                status: 'sent',
                automation_triggered: false,
                response_to: message_id || null,
                created_at: new Date().toISOString()
            };

            const messageResponse = await fetch(`${supabaseUrl}/rest/v1/whatsapp_messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(messageData)
            });

            const savedMessage = await messageResponse.json();

            // Update conversation
            const convResponse = await fetch(`${supabaseUrl}/rest/v1/whatsapp_conversations?customer_id=eq.${customer_id}&select=*`, {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            });

            const conversations = await convResponse.json();
            if (conversations && conversations.length > 0) {
                await fetch(`${supabaseUrl}/rest/v1/whatsapp_conversations?id=eq.${conversations[0].id}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        last_message_at: new Date().toISOString(),
                        total_messages: (conversations[0].total_messages || 0) + 1,
                        updated_at: new Date().toISOString()
                    })
                });
            }

            return new Response(JSON.stringify({
                data: {
                    success: true,
                    message: savedMessage[0],
                    whatsapp_status: await whatsappResponse.json()
                }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        throw new Error('Invalid action. Use: send_message, get_messages, or send_reply');

    } catch (error) {
        console.error('Chat message error:', error);

        const errorResponse = {
            error: {
                code: 'CHAT_MESSAGE_FAILED',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
