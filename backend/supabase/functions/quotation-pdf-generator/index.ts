// WoodEx Quotation PDF Generator Edge Function
// Generates professional PDF quotations with company branding

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
        const { quotationId } = await req.json();

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

        if (!itemsResponse.ok) {
            throw new Error('Failed to fetch quotation items');
        }

        const items = await itemsResponse.json();

        // Generate HTML for PDF
        const htmlContent = generatePDFHTML(quotation, items);

        // Generate PDF using HTML content
        // Note: In production, use a proper PDF generation service or library
        // For now, returning HTML that can be converted to PDF on frontend

        const pdfData = {
            quotationId,
            quoteNumber: quotation.quote_number,
            htmlContent,
            generatedAt: new Date().toISOString(),
            // In production, this would contain actual PDF binary data
            pdfUrl: `${supabaseUrl}/storage/v1/object/public/quotations/${quotation.quote_number}.pdf`
        };

        // Log PDF generation activity
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
                activity_type: 'pdf_generated',
                description: 'PDF quotation generated',
                metadata: { quote_number: quotation.quote_number }
            })
        });

        return new Response(JSON.stringify({ data: pdfData }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('PDF generation error:', error);

        const errorResponse = {
            error: {
                code: 'PDF_GENERATION_FAILED',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

function generatePDFHTML(quotation, items) {
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-PK', {
            style: 'currency',
            currency: 'PKR'
        }).format(amount);
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-PK', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const itemsHTML = items.map((item, index) => `
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${index + 1}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
                <strong>${item.item_name}</strong>
                ${item.description ? `<br><small style="color: #6b7280;">${item.description}</small>` : ''}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.unit_price)}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;"><strong>${formatCurrency(item.line_total)}</strong></td>
        </tr>
    `).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Quotation ${quotation.quote_number}</title>
            <style>
                body { font-family: 'Arial', sans-serif; margin: 0; padding: 40px; color: #1f2937; }
                .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; }
                .company-name { font-size: 32px; font-weight: bold; color: #2563eb; margin-bottom: 5px; }
                .company-tagline { font-size: 14px; color: #6b7280; }
                .quote-details { display: flex; justify-content: space-between; margin-bottom: 30px; }
                .section { margin-bottom: 30px; }
                .section-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #1f2937; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th { background-color: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; }
                .summary { background-color: #f9fafb; padding: 20px; border-radius: 8px; }
                .summary-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
                .summary-row.total { font-size: 18px; font-weight: bold; color: #2563eb; padding-top: 10px; border-top: 2px solid #d1d5db; }
                .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="company-name">WOODEX</div>
                <div class="company-tagline">Premium Office Furniture Solutions</div>
            </div>

            <div class="quote-details">
                <div>
                    <p><strong>Quote Number:</strong> ${quotation.quote_number}</p>
                    <p><strong>Date:</strong> ${formatDate(quotation.created_at)}</p>
                    <p><strong>Valid Until:</strong> ${quotation.valid_until ? formatDate(quotation.valid_until) : 'N/A'}</p>
                </div>
                <div>
                    <p><strong>Customer:</strong> ${quotation.customer_id || 'N/A'}</p>
                    <p><strong>Status:</strong> <span style="text-transform: capitalize;">${quotation.status}</span></p>
                </div>
            </div>

            <div class="section">
                <div class="section-title">Items</div>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 5%;">#</th>
                            <th style="width: 40%;">Item</th>
                            <th style="width: 10%; text-align: center;">Qty</th>
                            <th style="width: 20%; text-align: right;">Unit Price</th>
                            <th style="width: 25%; text-align: right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHTML}
                    </tbody>
                </table>
            </div>

            <div class="summary">
                <div class="summary-row">
                    <span>Subtotal:</span>
                    <span>${formatCurrency(quotation.subtotal)}</span>
                </div>
                ${quotation.discount_amount > 0 ? `
                <div class="summary-row">
                    <span>Discount:</span>
                    <span>-${formatCurrency(quotation.discount_amount)}</span>
                </div>
                ` : ''}
                <div class="summary-row">
                    <span>Tax (17% GST):</span>
                    <span>${formatCurrency(quotation.tax_amount)}</span>
                </div>
                ${quotation.shipping_cost > 0 ? `
                <div class="summary-row">
                    <span>Shipping:</span>
                    <span>${formatCurrency(quotation.shipping_cost)}</span>
                </div>
                ` : ''}
                <div class="summary-row total">
                    <span>Total Amount:</span>
                    <span>${formatCurrency(quotation.total_amount)}</span>
                </div>
            </div>

            ${quotation.notes ? `
            <div class="section">
                <div class="section-title">Notes</div>
                <p style="color: #6b7280;">${quotation.notes}</p>
            </div>
            ` : ''}

            <div class="section">
                <div class="section-title">Terms & Conditions</div>
                <p style="font-size: 12px; color: #6b7280;">
                    ${quotation.terms_conditions || 
                    '1. This quotation is valid for 30 days from the date of issue.<br>' +
                    '2. Prices are subject to change based on customization requirements.<br>' +
                    '3. Delivery timeline: 4-6 weeks from order confirmation.<br>' +
                    '4. Payment terms: 50% advance, 50% on delivery.<br>' +
                    '5. All prices are in Pakistani Rupees (PKR) and include 17% GST.'}
                </p>
            </div>

            <div class="footer">
                <p><strong>WoodEx Furniture</strong> | Karachi, Pakistan</p>
                <p>Email: sales@woodex.pk | Phone: +92 300 1234567 | Web: www.woodex.pk</p>
            </div>
        </body>
        </html>
    `;
}
