import { supabase } from '@/lib/supabase'
import { DEFAULT_ORGANIZATION_ID } from '@/config/organization'
import { getOrCreateClient, updateClient } from './clients.service'


export async function fetchPlannedAppointments({
  date,
  staffId,
  assignment,
  location
}) {

  let query = supabase
    .from('appointments')
    .select(`
      id,
      start_time,
      status,
      source,
      is_external,
      client:clients (
        id,
        name,
        last_name,
        phone
      ),
      staff:staff (
        id,
        name
      ),
      appointment_services (
        service:services (
          id,
          name
        )
      )
    `)
    .in('status', ['scheduled', 'in_progress'])
    .order('start_time', { ascending: true })

  // 👉 Filtre date
  if (date) {
    query = query
      .gte('start_time', `${date}T00:00:00`)
      .lte('start_time', `${date}T23:59:59`)
  }

  // 👉 Filtre staff
  if (staffId) {
    query = query.eq('staff_id', staffId)
  }

  // 👉 Filtre affectation
  if (assignment === 'assigned') {
    query = query.not('staff_id', 'is', null)
  }

  if (assignment === 'unassigned') {
    query = query.is('staff_id', null)
  }

  // 👉 Filtre lieu (interne / externe)
  if (location === 'external') {
    query = query.eq('is_external', true)
  }

  if (location === 'internal') {
    query = query.eq('is_external', false)
  }

  const { data, error } = await query

  if (error) throw error
  return data || []
}

/* =========================
   CREATE RDV (SANS DOUBLON CLIENT)
========================= */

export async function createAppointment(payload) {
  let client

  /* =========================
     CLIENT
  ========================= */

  client = await getOrCreateClient(payload.client)


  /* =========================
     CREATE APPOINTMENT
  ========================= */
  const { data: appointment, error } = await supabase
    .from('appointments')
    .insert({
      organization_id: DEFAULT_ORGANIZATION_ID,
      client_id: client.id,
      staff_id: payload.staff_id || null,
      type: 'appointment',
      status: 'scheduled',
      start_time: payload.start_time,
      is_external: payload.is_external || false
    })
    .select()
    .single()

  if (error) throw error

  /* =========================
     LINK SERVICES
  ========================= */
  if (payload.services?.length) {
    const links = payload.services.map(serviceId => ({
      appointment_id: appointment.id,
      service_id: serviceId
    }))

    const { error: servicesError } = await supabase
      .from('appointment_services')
      .insert(links)

    if (servicesError) throw servicesError
  }

  return appointment
}

/* =========================
   UPDATE RDV
========================= */
export async function updateAppointment(payload) {
  let client

  if (!payload.id) {
    throw new Error('RDV ID manquant')
  }

  if (!payload.client_id) {
    client = await getOrCreateClient(payload.client)
    payload.client_id = client.id

  }





  /* =========================
     2️⃣ UPDATE APPOINTMENT
  ========================= */
  const { error: rdvError } = await supabase
    .from('appointments')
    .update({
      staff_id: payload.staff_id || null,
      start_time: payload.start_time,
      client_id: payload.client_id,
      is_external: payload.is_external || false
    })
    .eq('id', payload.id)
    .eq('organization_id', DEFAULT_ORGANIZATION_ID)

  if (rdvError) throw rdvError

  /* =========================
     3️⃣ UPDATE SERVICES
  ========================= */
  await supabase
    .from('appointment_services')
    .delete()
    .eq('appointment_id', payload.id)

  if (payload.services?.length) {
    const links = payload.services.map(serviceId => ({
      appointment_id: payload.id,
      service_id: serviceId
    }))

    const { error } = await supabase
      .from('appointment_services')
      .insert(links)

    if (error) throw error
  }

  return true
}

export function cancelAppointment(id) {
  return supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', id)
}

export function noShowAppointment(id) {
  return supabase
    .from('appointments')
    .update({ status: 'no_show' })
    .eq('id', id)
}

export function deleteAppointment(id) {
  return supabase
    .from('appointments')
    .delete()
    .eq('id', id)
}
