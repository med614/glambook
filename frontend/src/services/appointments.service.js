import { supabase } from '@/lib/supabase'
import { getOrgId } from '@/composables/useOrgId'
import { getOrCreateClient } from './clients.service'

/* =========================
   FETCH RDV
========================= */
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
      external_period,

      client:clients (
        id,
        name,
        last_name,
        phone
      ),

      appointment_services (
        service:services (
          id,
          name,
          duration_minutes
        ),
        staff:staff (
          id,
          name
        )
      )
    `)
    .eq('type', 'appointment')
    .in('status', ['scheduled', 'in_progress'])
    .order('start_time', { ascending: true })

  /* 👉 Filtre date */
  if (date) {
    query = query
      .gte('start_time', `${date}T00:00:00`)
      .lte('start_time', `${date}T23:59:59`)
  }

  /* 👉 Filtre lieu */
  if (location === 'external') {
    query = query.eq('is_external', true)
  }

  if (location === 'internal') {
    query = query.eq('is_external', false)
  }

  const { data, error } = await query
  if (error) throw error

  let rdvs = data || []

  /* ==============================
     🎯 FILTRE STAFF (PAR PRESTATION)
  ============================== */
  if (staffId) {
    rdvs = rdvs.filter(rdv =>
      rdv.appointment_services?.some(
        as => as.staff?.id === staffId
      )
    )
  }

  /* ==============================
     🎯 FILTRE AFFECTATION
  ============================== */
  if (assignment === 'assigned') {
    rdvs = rdvs.filter(rdv =>
      rdv.appointment_services?.some(as => as.staff)
    )
  }

  if (assignment === 'unassigned') {
    rdvs = rdvs.filter(rdv =>
      !rdv.appointment_services?.some(as => as.staff)
    )
  }

  return rdvs
}

/* =========================
   CREATE RDV
========================= */
export async function createAppointment(payload) {
  /* =========================
     CLIENT
  ========================= */
  const client = await getOrCreateClient(payload.client)

  /* =========================
     CREATE APPOINTMENT
  ========================= */
  const { data: appointment, error } = await supabase
    .from('appointments')
    .insert({
      organization_id: await getOrgId(),
      client_id: client.id,
      //staff_id: payload.staff_id || null, // legacy (temporaire)
      type: 'appointment',
      status: 'scheduled',
      start_time: payload.start_time,
      is_external: payload.is_external || false,
      external_period: payload.external_period || null
    })
    .select()
    .single()

  if (error) throw error

  /* =========================
     LINK SERVICES + STAFF
  ========================= */
  if (payload.services?.length) {
    const links = payload.services.map(s => ({
      appointment_id: appointment.id,
      service_id: s.service_id,
      staff_id: s.staff_id || null,
      price_at_booking: s.price_at_booking ?? null
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
  if (!payload.id) {
    throw new Error('RDV ID manquant')
  }

  let clientId = payload.client_id

  if (!clientId) {
    const client = await getOrCreateClient(payload.client)
    clientId = client.id
  }

  /* =========================
     UPDATE APPOINTMENT
  ========================= */
  const { error: rdvError } = await supabase
    .from('appointments')
    .update({
     // staff_id: payload.staff_id || null, // legacy (temporaire)
      start_time: payload.start_time,
      client_id: clientId,
      is_external: payload.is_external || false,
      external_period: payload.external_period || null
    })
    .eq('id', payload.id)
    .eq('organization_id', await getOrgId())

  if (rdvError) throw rdvError

  /* =========================
     UPDATE SERVICES (RESET)
  ========================= */
  await supabase
    .from('appointment_services')
    .delete()
    .eq('appointment_id', payload.id)

  if (payload.services?.length) {
    const links = payload.services.map(s => ({
      appointment_id: payload.id,
      service_id: s.service_id,
      staff_id: s.staff_id || null,
      price_at_booking: s.price_at_booking ?? null
    }))

    const { error } = await supabase
      .from('appointment_services')
      .insert(links)

    if (error) throw error
  }

  return true
}

/* =========================
   ACTIONS STATUT
========================= */
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