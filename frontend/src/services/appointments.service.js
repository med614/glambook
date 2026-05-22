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
      payment_status,
      payment_method,

      client:clients (
        id,
        name,
        last_name,
        phone
      ),

      appointment_services (
        id,
        status,
        price_at_booking,
        service:services (
          id,
          name,
          duration_minutes,
          price
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
  const client = payload.client_id
    ? { id: payload.client_id }
    : await getOrCreateClient(payload.client)

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
  if (!payload.services?.length) {
    console.warn('[createAppointment] Aucun service fourni pour le RDV', appointment.id)
  }

  if (payload.services?.length) {
    let runningTime = new Date(payload.start_time)
    const links = payload.services.map(s => {
      const svcStart = runningTime.toISOString()
      if (!s.is_parallel) runningTime = new Date(runningTime.getTime() + (s.duration_minutes || 0) * 60000)
      return {
        appointment_id:   appointment.id,
        service_id:       s.service_id,
        staff_id:         s.staff_id || null,
        price_at_booking: s.price_at_booking ?? null,
        is_parallel:      s.is_parallel || false,
        start_time:       svcStart
      }
    })

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
     UPDATE SERVICES (CIBLÉ)
     Stratégie : diff entre existant en base et payload.
     - Supprime uniquement les lignes retirées par l'utilisateur.
     - Met à jour les lignes existantes (par id).
     - Insère les nouvelles lignes (sans id).
     Évite le delete-all qui perd toutes les prestations si l'insert échoue.
  ========================= */
  const validServices = (payload.services || []).filter(s => s.service_id)

  const { data: existing, error: fetchErr } = await supabase
    .from('appointment_services')
    .select('id')
    .eq('appointment_id', payload.id)
  if (fetchErr) throw fetchErr

  const existingIds = new Set((existing || []).map(s => s.id))
  const payloadIds  = new Set(validServices.filter(s => s.id).map(s => s.id))

  // Supprimer les lignes retirées
  const toDelete = [...existingIds].filter(id => !payloadIds.has(id))
  if (toDelete.length) {
    const { error: delErr } = await supabase
      .from('appointment_services')
      .delete()
      .in('id', toDelete)
    if (delErr) throw delErr
  }

  // Mettre à jour les lignes existantes et insérer les nouvelles
  for (const s of validServices) {
    if (s.id && existingIds.has(s.id)) {
      const { error } = await supabase
        .from('appointment_services')
        .update({
          service_id:       s.service_id,
          staff_id:         s.staff_id || null,
          price_at_booking: s.price_at_booking ?? null,
          is_parallel:      s.is_parallel || false
        })
        .eq('id', s.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('appointment_services')
        .insert({
          appointment_id:   payload.id,
          service_id:       s.service_id,
          staff_id:         s.staff_id || null,
          price_at_booking: s.price_at_booking ?? null,
          is_parallel:      s.is_parallel || false
        })
      if (error) throw error
    }
  }

  return true
}

/* =========================
   ACTIONS STATUT
========================= */
export async function cancelAppointment(id) {
  const now = new Date().toISOString()
  await supabase.from('appointment_services')
    .update({ status: 'cancelled' })
    .eq('appointment_id', id)
    .neq('status', 'cancelled')
  const { error } = await supabase.from('appointments')
    .update({ status: 'cancelled', end_time: now })
    .eq('id', id)
  if (error) throw error
}

export async function noShowAppointment(id) {
  const now = new Date().toISOString()
  await supabase.from('appointment_services')
    .update({ status: 'cancelled' })
    .eq('appointment_id', id)
    .neq('status', 'cancelled')
  const { error } = await supabase.from('appointments')
    .update({ status: 'noshow', end_time: now })
    .eq('id', id)
  if (error) throw error
}

export function deleteAppointment(id) {
  return supabase
    .from('appointments')
    .delete()
    .eq('id', id)
}

/* =========================
   CAISSE — PAIEMENT
========================= */
export async function payAppointment(id, method) {
  const { error } = await supabase
    .from('appointments')
    .update({ payment_status: 'paid', payment_method: method })
    .eq('id', id)
  if (error) throw error
}

export async function fetchDayPayments(date) {
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id,
      start_time,
      payment_status,
      payment_method,
      type,
      walkin_name,
      client:clients (name, last_name),
      appointment_services (
        price_at_booking,
        status
      )
    `)
    .eq('organization_id', orgId)
    .in('status', ['completed', 'in_progress'])
    .gte('start_time', `${date}T00:00:00`)
    .lte('start_time', `${date}T23:59:59`)
    .order('start_time', { ascending: true })
  if (error) throw error
  return (data || []).map(a => {
    const svcs = (a.appointment_services || []).filter(s => s.status !== 'cancelled')
    const total = svcs.every(s => s.price_at_booking == null)
      ? null
      : svcs.reduce((sum, s) => sum + (s.price_at_booking ?? 0), 0)
    const clientName = a.type === 'walkin'
      ? (a.walkin_name || 'Sans RDV')
      : (((a.client?.name || '') + ' ' + (a.client?.last_name || '')).trim() || 'Client')
    return {
      id: a.id,
      clientName,
      start_time: a.start_time,
      payment_status: a.payment_status,
      payment_method: a.payment_method,
      total
    }
  })
}