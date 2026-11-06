Deno.serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'false'
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        const { quotationId } = await req.json();

        if (!quotationId) {
            throw new Error('Quotation ID is required');
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // 1. Fetch quotation data
        const quotationResponse = await fetch(
            `${supabaseUrl}/rest/v1/quotations?id=eq.${quotationId}`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        const quotations = await quotationResponse.json();
        if (!quotations || quotations.length === 0) {
            throw new Error('Quotation not found');
        }
        const quotation = quotations[0];

        // 2. Fetch quotation items
        const itemsResponse = await fetch(
            `${supabaseUrl}/rest/v1/quotation_items?quotation_id=eq.${quotationId}`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        const items = await itemsResponse.json();

        // 3. Fetch customer data
        const customerResponse = await fetch(
            `${supabaseUrl}/rest/v1/customers?id=eq.${quotation.customer_id}`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        const customers = await customerResponse.json();
        const customer = customers[0];

        // 4. Generate HTML content for PDF
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 40px;
                    color: #333;
                }
                .header {
                    text-align: center;
                    border-bottom: 3px solid #000;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                }
                .company-name {
                    font-size: 32px;
                    font-weight: bold;
                    color: #000;
                }
                .quotation-title {
                    font-size: 24px;
                    margin-top: 10px;
                    color: #666;
                }
                .info-section {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 30px;
                }
                .info-box {
                    width: 48%;
                }
                .info-box h3 {
                    font-size: 14px;
                    text-transform: uppercase;
                    color: #666;
                    margin-bottom: 10px;
                }
                .info-box p {
                    margin: 5px 0;
                    font-size: 13px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 30px 0;
                }
                th {
                    background-color: #333;
                    color: white;
                    padding: 12px;
                    text-align: left;
                    font-size: 13px;
                }
                td {
                    padding: 10px 12px;
                    border-bottom: 1px solid #ddd;
                    font-size: 13px;
                }
                .text-right {
                    text-align: right;
                }
                .totals {
                    margin-top: 20px;
                    float: right;
                    width: 300px;
                }
                .totals table {
                    margin: 0;
                }
                .totals td {
                    border: none;
                    padding: 5px 12px;
                }
                .totals .total-row {
                    font-weight: bold;
                    font-size: 16px;
                    background-color: #f5f5f5;
                }
                .footer {
                    margin-top: 80px;
                    padding-top: 20px;
                    border-top: 1px solid #ddd;
                    font-size: 11px;
                    color: #666;
                    clear: both;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="company-name">WOODEX</div>
                <div class="quotation-title">QUOTATION</div>
            </div>

            <div class="info-section">
                <div class="info-box">
                    <h3>Quotation To:</h3>
                    <p><strong>${customer.full_name}</strong></p>
                    ${customer.company_name ? `<p>${customer.company_name}</p>` : ''}
                    <p>${customer.email || ''}</p>
                    <p>${customer.phone}</p>
                </div>
                <div class="info-box" style="text-align: right;">
                    <h3>Quotation Details:</h3>
                    <p><strong>Quote #:</strong> ${quotation.quote_number}</p>
                    <p><strong>Date:</strong> ${new Date(quotation.created_at).toLocaleDateString()}</p>
                    <p><strong>Valid Until:</strong> ${new Date(quotation.valid_until).toLocaleDateString()}</p>
                    <p><strong>Status:</strong> ${quotation.status.toUpperCase()}</p>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Description</th>
                        <th class="text-right">Qty</th>
                        <th class="text-right">Unit Price</th>
                        <th class="text-right">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map((item: any) => `
                    <tr>
                        <td>${item.item_name}</td>
                        <td>${item.description || ''}</td>
                        <td class="text-right">${item.quantity}</td>
                        <td class="text-right">${quotation.currency} ${item.unit_price.toFixed(2)}</td>
                        <td class="text-right">${quotation.currency} ${item.line_total.toFixed(2)}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="totals">
                <table>
                    <tr>
                        <td>Subtotal:</td>
                        <td class="text-right">${quotation.currency} ${quotation.subtotal.toFixed(2)}</td>
                    </tr>
                    ${quotation.discount_amount > 0 ? `
                    <tr>
                        <td>Discount:</td>
                        <td class="text-right">-${quotation.currency} ${quotation.discount_amount.toFixed(2)}</td>
                    </tr>
                    ` : ''}
                    <tr>
                        <td>Tax:</td>
                        <td class="text-right">${quotation.currency} ${quotation.tax_amount.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td>Shipping:</td>
                        <td class="text-right">${quotation.currency} ${quotation.shipping_cost.toFixed(2)}</td>
                    </tr>
                    <tr class="total-row">
                        <td>TOTAL:</td>
                        <td class="text-right">${quotation.currency} ${quotation.total_amount.toFixed(2)}</td>
                    </tr>
                </table>
            </div>

            <div class="footer">
                ${quotation.terms_conditions ? `
                <h4>Terms & Conditions:</h4>
                <p>${quotation.terms_conditions}</p>
                ` : ''}
                ${quotation.notes ? `
                <h4>Notes:</h4>
                <p>${quotation.notes}</p>
                ` : ''}
                <p style="margin-top: 20px;">Thank you for your business!</p>
            </div>
        </body>
        </html>
        `;

        // Note: In production, you would use a PDF generation service
        // For now, return the HTML content to be converted client-side or via external service
        
        return new Response(JSON.stringify({
            data: {
                htmlContent,
                quotationNumber: quotation.quote_number,
                message: 'PDF generation requires external service integration'
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Quotation generator error:', error);

        const errorResponse = {
            error: {
                code: 'QUOTATION_GENERATION_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
