import { supabase } from '../lib/supabase.js'

export const getAppointments = async (req, res) => {
    try {
        const { date, type, staff_id } = req.query

        // Default to today if no date provided
        let query = supabase
            .from('appointments')
            .select(`
        *,
        client:client_id(id, name),
        appointment_services (
          id,
          status,
          service:service_id(id, name, duration_minutes),
          staff:staff_id(id, name)
        )
      `)

        // Filter by date (approximate "starts on this day")
        if (date) {
            // Assume date is YYYY-MM-DD
            const startOfDay = `${date}T00:00:00`
            const endOfDay = `${date}T23:59:59`

            // Filter appointments that start within this day
            query = query.gte('start_time', startOfDay).lte('start_time', endOfDay)
        }

        if (type) {
            query = query.eq('type', type)
        }

        if (staff_id) {
            query = query.eq('staff_id', staff_id)
        }

        // Order by start_time
        query = query.order('start_time', { ascending: true })

        const { data, error } = await query

        if (error) throw error

        res.json(data)
    } catch (error) {
        console.error('Error fetching appointments:', error)
        res.status(500).json({ error: error.message })
    }
}

export const createAppointment = async (req, res) => {
    try {
        const {
            client_id,
            client_name,
            staff_id,
            service_id,
            start_time,
            end_time,
            type = 'appointment',
            status = 'scheduled',
            note
        } = req.body

        console.log('DEBUG: createAppointment called with:', JSON.stringify(req.body))

        // Simple validation
        if (!start_time) {
            return res.status(400).json({ error: 'start_time is required' })
        }

        let finalClientId = client_id

        // If client_name provided but no ID, find or create client
        if (!finalClientId && client_name) {
            // Check if exists
            const { data: existingClient } = await supabase
                .from('clients')
                .select('id')
                .ilike('name', client_name)
                .limit(1)
                .single()

            if (existingClient) {
                finalClientId = existingClient.id
            } else {
                // Create new
                const { data: newClient, error: createError } = await supabase
                    .from('clients')
                    .insert([{ name: client_name, whatsapp_language: 'fr' }])
                    .select()
                    .single()

                if (createError) throw createError
                finalClientId = newClient.id
            }
        }

        if (!finalClientId) {
            return res.status(400).json({ error: 'Client ID or Name is required' })
        }

        const insertPayload = {
            client_id: finalClientId,
            staff_id,
            start_time,
            end_time,
            type,
            status
        }
        console.log('DEBUG: Inserting:', insertPayload)

        const { data: appointment, error } = await supabase
            .from('appointments')
            .insert([insertPayload])
            .select()
            .single()

        if (error) throw error

        // Link Service if provided and valid UUID
        const isUuid = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)

        if (service_id && isUuid(service_id) && appointment) {
            await supabase
                .from('appointment_services')
                .insert([{
                    appointment_id: appointment.id,
                    service_id: service_id,
                    staff_id: staff_id
                }])
        }

        res.status(201).json(appointment)
    } catch (error) {
        console.error('Error creating appointment:', error)
        res.status(500).json({ error: error.message })
    }
}
