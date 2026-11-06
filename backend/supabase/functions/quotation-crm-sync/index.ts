// WoodEx Quotation CRM Sync Edge Function
// Syncs quotation data with Woodex Master Platform CRM

Deno.serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'false'
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        const { quotationId, syncType = 'full' } = await req.json();

        if (!quotationId) {
            throw new Error('Quotation ID is required');
        }

        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Fetch quotation data
        const quotationResponse = await fetch(
            `${supabaseUrl}/rest/v1/quotations?id=eq.${quotationId}&select=*`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        if (!quotationResponse.ok) {
            throw new Error('Failed to fetch quotation');
        }

        const quotations = await quotationResponse.json();
        if (!quotations || quotations.length === 0) {
            throw new Error('Quotation not found');
        }

        const quotation = quotations[0];

        // Fetch quotation items
        const itemsResponse = await fetch(
            `${supabaseUrl}/rest/v1/quotation_items?quotation_id=eq.${quotationId}&select=*`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        const items = itemsResponse.ok ? await itemsResponse.json() : [];

        // Sync customer data to CRM (customers table)
        let customerId = quotation.customer_id;

        if (!customerId && (quotation.customer_email || quotation.customer_phone)) {
            // Check if customer exists
            const customerCheckResponse = await fetch(
                `${supabaseUrl}/rest/v1/customers?email=eq.${quotation.customer_email}&select=id`,
                {
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey
                    }
                }
            );

            const existingCustomers = customerCheckResponse.ok ? await customerCheckResponse.json() : [];

            if (existingCustomers.length > 0) {
                customerId = existingCustomers[0].id;
            } else {
                // Create new customer in CRM
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
                            name: quotation.customer_name || 'Unknown',
                            email: quotation.customer_email,
                            phone: quotation.customer_phone,
                            company: quotation.customer_company,
                            customer_type: 'lead',
                            source: 'e-quotation'
                        })
                    }
                );

                if (newCustomerResponse.ok) {
                    const newCustomers = await newCustomerResponse.json();
                    customerId = newCustomers[0]?.id;

                    // Update quotation with customer ID
                    await fetch(
                        `${supabaseUrl}/rest/v1/quotations?id=eq.${quotationId}`,
                        {
                            method: 'PATCH',
                            headers: {
                                'Authorization': `Bearer ${serviceRoleKey}`,
                                'apikey': serviceRoleKey,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ customer_id: customerId })
                        }
                    );
                }
            }
        }

        // Sync quotation as opportunity/lead in CRM
        const opportunityData = {
            customer_id: customerId,
            title: `Quote ${quotation.quote_number}`,
            description: `E-commerce quotation - ${items.length} items`,
            amount: quotation.total_amount,
            stage: mapQuotationStatusToOpportunityStage(quotation.status),
            probability: mapQuotationStatusToProbability(quotation.status),
            expected_close_date: quotation.valid_until,
            source: 'e-commerce',
            metadata: {
                quotation_id: quotationId,
                quote_number: quotation.quote_number,
                item_count: items.length
            }
        };

        // Check if opportunity already exists for this quotation
        const opportunityCheckResponse = await fetch(
            `${supabaseUrl}/rest/v1/opportunities?metadata->>quotation_id=eq.${quotationId}&select=id`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        const existingOpportunities = opportunityCheckResponse.ok ? await opportunityCheckResponse.json() : [];

        let opportunityId;
        if (existingOpportunities.length > 0) {
            // Update existing opportunity
            opportunityId = existingOpportunities[0].id;
            await fetch(
                `${supabaseUrl}/rest/v1/opportunities?id=eq.${opportunityId}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(opportunityData)
                }
            );
        } else {
            // Create new opportunity
            const opportunityResponse = await fetch(
                `${supabaseUrl}/rest/v1/opportunities`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify(opportunityData)
                }
            );

            if (opportunityResponse.ok) {
                const opportunities = await opportunityResponse.json();
                opportunityId = opportunities[0]?.id;
            }
        }

        // Log CRM sync activity
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
                activity_type: 'crm_sync',
                description: 'Quotation synced to CRM',
                metadata: {
                    customer_id: customerId,
                    opportunity_id: opportunityId,
                    sync_type: syncType
                }
            })
        });

        return new Response(JSON.stringify({
            data: {
                quotationId,
                customerId,
                opportunityId,
                syncedAt: new Date().toISOString(),
                message: 'CRM sync successful'
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('CRM sync error:', error);

        const errorResponse = {
            error: {
                code: 'CRM_SYNC_FAILED',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

function mapQuotationStatusToOpportunityStage(status) {
    const statusMap = {
        'draft': 'prospecting',
        'sent': 'qualification',
        'viewed': 'needs_analysis',
        'approved': 'negotiation',
        'rejected': 'closed_lost',
        'expired': 'closed_lost',
        'converted': 'closed_won'
    };
    return statusMap[status] || 'prospecting';
}

function mapQuotationStatusToProbability(status) {
    const probabilityMap = {
        'draft': 10,
        'sent': 25,
        'viewed': 50,
        'approved': 90,
        'rejected': 0,
        'expired': 0,
        'converted': 100
    };
    return probabilityMap[status] || 10;
}
