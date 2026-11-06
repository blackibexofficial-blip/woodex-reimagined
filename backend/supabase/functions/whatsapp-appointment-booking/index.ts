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
            appointment_type, 
            scheduled_date, 
            scheduled_time,
            duration_minutes,
            location,
            notes,
            appointment_id,
            check_date
        } = await req.json();

        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Action: Check Availability
        if (action === 'check_availability') {
            if (!check_date) {
                throw new Error('check_date is required for availability check');
            }

            const startDate = `${check_date}T00:00:00Z`;
            const endDate = `${check_date}T23:59:59Z`;

            // Fetch existing appointments for the date
            const appointmentsResponse = await fetch(
                `${supabaseUrl}/rest/v1/whatsapp_appointments?scheduled_at=gte.${startDate}&scheduled_at=lte.${endDate}&status=in.(scheduled,confirmed)&select=scheduled_at,duration_minutes`,
                {
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey
                    }
                }
            );

            if (!appointmentsResponse.ok) {
                throw new Error('Failed to fetch appointments');
            }

            const existingAppointments = await appointmentsResponse.json();

            // Generate available time slots (9 AM to 6 PM, 1-hour intervals)
            const availableSlots = [];
            const businessHours = [9, 10, 11, 12, 13, 14, 15, 16, 17]; // 9 AM to 5 PM

            for (const hour of businessHours) {
                const slotTime = `${hour.toString().padStart(2, '0')}:00`;
                const slotDateTime = new Date(`${check_date}T${slotTime}:00Z`);
                
                // Check if slot is occupied
                const isOccupied = existingAppointments.some(appt => {
                    const apptStart = new Date(appt.scheduled_at);
                    const apptEnd = new Date(apptStart.getTime() + (appt.duration_minutes * 60000));
                    return slotDateTime >= apptStart && slotDateTime < apptEnd;
                });

                if (!isOccupied) {
                    availableSlots.push({
                        time: slotTime,
                        available: true
                    });
                }
            }

            return new Response(JSON.stringify({
                data: {
                    date: check_date,
                    available_slots: availableSlots,
                    total_available: availableSlots.length
                }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Action: Book Appointment
        if (action === 'book_appointment') {
            if (!customer_id || !appointment_type || !scheduled_date || !scheduled_time) {
                throw new Error('customer_id, appointment_type, scheduled_date, and scheduled_time are required');
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

            // Combine date and time
            const scheduledDateTime = new Date(`${scheduled_date}T${scheduled_time}:00Z`);

            // Check if slot is still available
            const startCheck = new Date(scheduledDateTime.getTime() - 30 * 60000); // 30 min before
            const endCheck = new Date(scheduledDateTime.getTime() + (duration_minutes || 60) * 60000);

            const conflictResponse = await fetch(
                `${supabaseUrl}/rest/v1/whatsapp_appointments?scheduled_at=gte.${startCheck.toISOString()}&scheduled_at=lt.${endCheck.toISOString()}&status=in.(scheduled,confirmed)&select=id`,
                {
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey
                    }
                }
            );

            const conflicts = await conflictResponse.json();
            if (conflicts && conflicts.length > 0) {
                throw new Error('Time slot is no longer available');
            }

            // Create appointment
            const appointmentData = {
                customer_id: customer_id,
                appointment_type: appointment_type,
                scheduled_at: scheduledDateTime.toISOString(),
                duration_minutes: duration_minutes || 60,
                location: location || 'WoodEx Furniture Showroom, Karachi',
                status: 'scheduled',
                notes: notes || '',
                created_at: new Date().toISOString()
            };

            const createResponse = await fetch(`${supabaseUrl}/rest/v1/whatsapp_appointments`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(appointmentData)
            });

            if (!createResponse.ok) {
                const errorText = await createResponse.text();
                throw new Error(`Failed to create appointment: ${errorText}`);
            }

            const newAppointment = await createResponse.json();

            // Send confirmation WhatsApp message
            const phoneNumber = customer.phone || customer.whatsapp_number;
            if (phoneNumber) {
                const confirmationMessage = `Your ${appointment_type} appointment is confirmed!\n\nDate: ${scheduled_date}\nTime: ${scheduled_time}\nLocation: ${location || 'WoodEx Furniture Showroom, Karachi'}\n\nWe'll send you a reminder 24 hours before. Call us at +92-300-1234567 for any changes.`;

                const whatsappEngineUrl = `${supabaseUrl}/functions/v1/whatsapp-message-handler`;
                await fetch(whatsappEngineUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        phone_number: phoneNumber,
                        message: confirmationMessage,
                        trigger_type: 'appointment_booking'
                    })
                });

                // Log message
                await fetch(`${supabaseUrl}/rest/v1/whatsapp_messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        customer_id: customer_id,
                        phone_number: phoneNumber,
                        direction: 'outbound',
                        message_type: 'text',
                        content: confirmationMessage,
                        status: 'sent',
                        automation_triggered: true
                    })
                });
            }

            return new Response(JSON.stringify({
                data: {
                    success: true,
                    appointment: newAppointment[0],
                    message: 'Appointment booked successfully'
                }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Action: Cancel Appointment
        if (action === 'cancel_appointment') {
            if (!appointment_id) {
                throw new Error('appointment_id is required');
            }

            const cancelResponse = await fetch(`${supabaseUrl}/rest/v1/whatsapp_appointments?id=eq.${appointment_id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: 'cancelled',
                    cancelled_at: new Date().toISOString()
                })
            });

            if (!cancelResponse.ok) {
                throw new Error('Failed to cancel appointment');
            }

            return new Response(JSON.stringify({
                data: {
                    success: true,
                    message: 'Appointment cancelled successfully'
                }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        throw new Error('Invalid action. Use: check_availability, book_appointment, or cancel_appointment');

    } catch (error) {
        console.error('Appointment booking error:', error);

        const errorResponse = {
            error: {
                code: 'APPOINTMENT_BOOKING_FAILED',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
