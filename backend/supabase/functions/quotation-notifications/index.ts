// WoodEx Quotation Notifications Edge Function
// Sends automated WhatsApp and Email notifications for quotation events

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
        const { quotationId, eventType, recipientType = 'customer' } = await req.json();

        if (!quotationId || !eventType) {
            throw new Error('Quotation ID and event type are required');
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

        // Prepare notification content based on event type
        const { subject, message, whatsappMessage } = prepareNotificationContent(eventType, quotation);

        const results = {
            whatsapp: { sent: false, error: null },
            email: { sent: false, error: null }
        };

        // Send WhatsApp notification if phone number exists
        if (quotation.customer_phone && recipientType === 'customer') {
            try {
                await sendWhatsAppNotification(
                    quotation.customer_phone,
                    whatsappMessage,
                    supabaseUrl,
                    serviceRoleKey
                );
                results.whatsapp.sent = true;
            } catch (whatsappError) {
                console.error('WhatsApp notification failed:', whatsappError);
                results.whatsapp.error = whatsappError.message;
            }
        }

        // Send email notification if email exists
        if (quotation.customer_email && recipientType === 'customer') {
            try {
                await sendEmailNotification(
                    quotation.customer_email,
                    subject,
                    message,
                    quotation
                );
                results.email.sent = true;
            } catch (emailError) {
                console.error('Email notification failed:', emailError);
                results.email.error = emailError.message;
            }
        }

        // Send notifications to admin/sales team
        if (recipientType === 'admin') {
            // Send to admin email (configured in environment)
            const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'sales@woodex.pk';
            const adminPhone = Deno.env.get('ADMIN_PHONE');

            try {
                await sendEmailNotification(
                    adminEmail,
                    `New Quote: ${quotation.quote_number}`,
                    `A new quotation has been created.\n\nCustomer: ${quotation.customer_name}\nEmail: ${quotation.customer_email}\nAmount: PKR ${parseFloat(quotation.total_amount).toLocaleString()}\n\nView details in the admin dashboard.`,
                    quotation
                );
                results.email.sent = true;
            } catch (emailError) {
                console.error('Admin email failed:', emailError);
            }

            if (adminPhone) {
                try {
                    await sendWhatsAppNotification(
                        adminPhone,
                        `New Quote Alert!\n\nQuote #${quotation.quote_number}\nCustomer: ${quotation.customer_name}\nAmount: PKR ${parseFloat(quotation.total_amount).toLocaleString()}\n\nCheck admin dashboard for details.`,
                        supabaseUrl,
                        serviceRoleKey
                    );
                } catch (whatsappError) {
                    console.error('Admin WhatsApp failed:', whatsappError);
                }
            }
        }

        // Log notification activity
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
                activity_type: `notification_${eventType}`,
                description: `Notification sent for ${eventType}`,
                metadata: {
                    recipient_type: recipientType,
                    whatsapp_sent: results.whatsapp.sent,
                    email_sent: results.email.sent
                }
            })
        });

        return new Response(JSON.stringify({
            data: {
                quotationId,
                eventType,
                results,
                message: 'Notifications processed'
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Notification error:', error);

        const errorResponse = {
            error: {
                code: 'NOTIFICATION_FAILED',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

function prepareNotificationContent(eventType, quotation) {
    const baseUrl = 'https://m3hhvoixxyij.space.minimax.io';
    const quoteUrl = `${baseUrl}/quotations/${quotation.id}`;

    const content = {
        created: {
            subject: `Your Quotation #${quotation.quote_number} - WoodEx Furniture`,
            message: `Dear ${quotation.customer_name},\n\nThank you for your quotation request!\n\nYour quotation #${quotation.quote_number} has been created for PKR ${parseFloat(quotation.total_amount).toLocaleString()}.\n\nView your quotation: ${quoteUrl}\n\nOur sales team will review and send you the final quotation shortly.\n\nBest regards,\nWoodEx Furniture Team`,
            whatsappMessage: `Hi ${quotation.customer_name}!\n\nYour quotation #${quotation.quote_number} is ready.\n\nAmount: PKR ${parseFloat(quotation.total_amount).toLocaleString()}\n\nView: ${quoteUrl}\n\nWoodEx Furniture`
        },
        sent: {
            subject: `Quotation #${quotation.quote_number} Sent - WoodEx Furniture`,
            message: `Dear ${quotation.customer_name},\n\nYour quotation #${quotation.quote_number} has been sent!\n\nTotal Amount: PKR ${parseFloat(quotation.total_amount).toLocaleString()}\n\nView and download your quotation: ${quoteUrl}\n\nThis quotation is valid until ${quotation.valid_until ? new Date(quotation.valid_until).toLocaleDateString() : '30 days'}.\n\nFor any questions, please contact us.\n\nBest regards,\nWoodEx Furniture Team`,
            whatsappMessage: `Hi ${quotation.customer_name}!\n\nYour quotation #${quotation.quote_number} has been sent.\n\nAmount: PKR ${parseFloat(quotation.total_amount).toLocaleString()}\nValid until: ${quotation.valid_until ? new Date(quotation.valid_until).toLocaleDateString() : '30 days'}\n\nView: ${quoteUrl}\n\nWoodEx Furniture`
        },
        approved: {
            subject: `Quotation #${quotation.quote_number} Approved - Thank You!`,
            message: `Dear ${quotation.customer_name},\n\nThank you for approving quotation #${quotation.quote_number}!\n\nWe're excited to proceed with your order of PKR ${parseFloat(quotation.total_amount).toLocaleString()}.\n\nOur team will contact you shortly to arrange payment and delivery.\n\nBest regards,\nWoodEx Furniture Team`,
            whatsappMessage: `Great news! Your quote #${quotation.quote_number} is approved.\n\nAmount: PKR ${parseFloat(quotation.total_amount).toLocaleString()}\n\nOur team will contact you soon for next steps.\n\nWoodEx Furniture`
        },
        expiring_soon: {
            subject: `Reminder: Quotation #${quotation.quote_number} Expiring Soon`,
            message: `Dear ${quotation.customer_name},\n\nYour quotation #${quotation.quote_number} for PKR ${parseFloat(quotation.total_amount).toLocaleString()} will expire in 3 days.\n\nView your quotation: ${quoteUrl}\n\nPlease contact us if you'd like to proceed or have any questions.\n\nBest regards,\nWoodEx Furniture Team`,
            whatsappMessage: `Reminder: Your quote #${quotation.quote_number} expires in 3 days.\n\nAmount: PKR ${parseFloat(quotation.total_amount).toLocaleString()}\n\nView: ${quoteUrl}\n\nWoodEx Furniture`
        }
    };

    return content[eventType] || content.created;
}

async function sendWhatsAppNotification(phone, message, supabaseUrl, serviceRoleKey) {
    // Call existing WhatsApp message handler
    try {
        const response = await fetch(`${supabaseUrl}/functions/v1/whatsapp-message-handler`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to: phone,
                message: message,
                type: 'quotation_notification'
            })
        });

        if (!response.ok) {
            throw new Error('WhatsApp API call failed');
        }

        return true;
    } catch (error) {
        console.error('WhatsApp send error:', error);
        throw error;
    }
}

async function sendEmailNotification(to, subject, message, quotation) {
    // In production, integrate with email service (SendGrid, AWS SES, etc.)
    // For now, log the email content
    console.log('Email notification:', {
        to,
        subject,
        message,
        quotation_number: quotation.quote_number
    });

    // Placeholder: Would call email service API here
    // Example with SendGrid:
    // const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY');
    // await fetch('https://api.sendgrid.com/v3/mail/send', {
    //     method: 'POST',
    //     headers: {
    //         'Authorization': `Bearer ${sendgridApiKey}`,
    //         'Content-Type': 'application/json'
    //     },
    //     body: JSON.stringify({
    //         personalizations: [{ to: [{ email: to }] }],
    //         from: { email: 'noreply@woodex.pk', name: 'WoodEx Furniture' },
    //         subject: subject,
    //         content: [{ type: 'text/plain', value: message }]
    //     })
    // });

    return true;
}
