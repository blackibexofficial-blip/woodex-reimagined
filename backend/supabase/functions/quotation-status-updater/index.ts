// WoodEx Quotation Status Updater Edge Function
// Updates quotation status and triggers notifications

Deno.serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'false'
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        const { quotationId, newStatus, userId, userName, metadata = {} } = await req.json();

        if (!quotationId || !newStatus) {
            throw new Error('Quotation ID and new status are required');
        }

        const validStatuses = ['draft', 'sent', 'viewed', 'approved', 'rejected', 'expired', 'converted'];
        if (!validStatuses.includes(newStatus)) {
            throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }

        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Prepare update data
        const updateData = {
            status: newStatus,
            updated_at: new Date().toISOString()
        };

        // Add timestamp for specific status changes
        if (newStatus === 'viewed') {
            updateData.viewed_at = new Date().toISOString();
        } else if (newStatus === 'approved') {
            updateData.approved_at = new Date().toISOString();
        } else if (newStatus === 'rejected') {
            updateData.rejected_at = new Date().toISOString();
        }

        // Update quotation status
        const updateResponse = await fetch(
            `${supabaseUrl}/rest/v1/quotations?id=eq.${quotationId}`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(updateData)
            }
        );

        if (!updateResponse.ok) {
            const errorText = await updateResponse.text();
            throw new Error(`Failed to update quotation: ${errorText}`);
        }

        const updatedQuotation = await updateResponse.json();

        // Log activity
        await fetch(`${supabaseUrl}/rest/v1/quotation_activities`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                quotation_id: quotationId,
                activity_type: `status_changed_to_${newStatus}`,
                description: `Status changed to ${newStatus}`,
                metadata: {
                    ...metadata,
                    previous_status: updatedQuotation[0]?.status,
                    new_status: newStatus
                },
                user_id: userId || null,
                user_name: userName || 'System'
            })
        });

        // Trigger WhatsApp notification based on status
        if (newStatus === 'sent' || newStatus === 'approved') {
            // Call notification function
            try {
                await fetch(`${supabaseUrl}/functions/v1/quotation-notifications`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        quotationId,
                        eventType: newStatus,
                        recipientType: 'customer'
                    })
                });
            } catch (notificationError) {
                // Log but don't fail if notification fails
                console.error('Notification failed:', notificationError);
            }
        }

        return new Response(JSON.stringify({
            data: {
                quotation: updatedQuotation[0],
                message: `Status updated to ${newStatus}`,
                timestamp: new Date().toISOString()
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Status update error:', error);

        const errorResponse = {
            error: {
                code: 'STATUS_UPDATE_FAILED',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
