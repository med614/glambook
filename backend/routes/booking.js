import { Router } from 'express'
import { supabase } from '../lib/supabase.js'

const router = Router()

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalise et formate un numéro marocain → "06 60 44 36 60"
 * Gère : +212XXXXXXXXX, 00212XXXXXXXXX, 06XXXXXXXX, 6XXXXXXXX (9 chiffres)
 */
function formatPhone(raw) {
  let d = String(raw).replace(/\D/g, '')

  // Préfixe international +212 / 00212
  if (d.startsWith('00212')) d = '0' + d.slice(5)
  else if (d.startsWith('212') && d.length >= 11) d = '0' + d.slice(3)

  // 9 chiffres sans le 0 initial (ex: 660443660)
  if (d.length === 9 && !d.startsWith('0')) d = '0' + d

  // Tronquer à 10
  d = d.slice(0, 10)

  // Formater XX XX XX XX XX
  return d.length === 10
    ? d.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5')
    : d
}

function buildHourlySlots(open, close) {
  const slots = []
  let [h, m] = open.split(':').map(Number)
  const [eh, em] = close.split(':').map(Number)
  while (h < eh || (h === eh && m < em)) {
    slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`)
    m += 60
    if (m >= 60) { h += Math.floor(m / 60); m = m % 60 }
  }
  return slots
}

async function getOrgSettings(orgId) {
  const { data } = await supabase
    .from('organization_settings')
    .select('opening_hours')
    .eq('org_id', orgId)
    .maybeSingle()
  return data?.opening_hours || null
}

async function getClosures(orgId) {
  const { data } = await supabase
    .from('salon_closures')
    .select('date, end_date')
    .eq('org_id', orgId)
  if (!data) return new Set()
  const closed = new Set()
  for (const c of data) {
    let cur = new Date(c.date + 'T12:00:00')
    const end = new Date(c.end_date + 'T12:00:00')
    while (cur <= end) {
      closed.add(cur.toLocaleDateString('en-CA'))
      cur.setDate(cur.getDate() + 1)
    }
  }
  return closed
}

// Returns { isClosed, label } for a given date
async function getActiveClosure(orgId, dateStr) {
  const { data } = await supabase
    .from('salon_closures')
    .select('date, end_date, label')
    .eq('org_id', orgId)
    .lte('date', dateStr)
    .gte('end_date', dateStr)
    .maybeSingle()
  return data || null
}

// ── routes ───────────────────────────────────────────────────────────────────

// GET /booking/orgs — liste des organisations actives
router.get('/orgs', async (req, res) => {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, logo_url')
    .eq('is_active', true)
    .order('name')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// GET /booking/:orgId/info
router.get('/:orgId/info', async (req, res) => {
  const { orgId } = req.params
  const [{ data: org }, { data: settings }] = await Promise.all([
    supabase.from('organizations').select('id, name, logo_url').eq('id', orgId).maybeSingle(),
    supabase.from('organization_settings').select('opening_hours').eq('org_id', orgId).maybeSingle()
  ])
  if (!org) return res.status(404).json({ error: 'Organisation introuvable' })
  res.json({ ...org, opening_hours: settings?.opening_hours || null })
})

// GET /booking/:orgId/services
router.get('/:orgId/services', async (req, res) => {
  const { orgId } = req.params
  const { data, error } = await supabase
    .from('services')
    .select('id, name, name_ar, price, duration_minutes, category_id')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('name')
  if (error) return res.status(500).json({ error: error.message })

  // Fetch category names separately (FK not declared in Supabase)
  const catIds = [...new Set((data || []).map(s => s.category_id).filter(Boolean))]
  let catMap = {}
  if (catIds.length) {
    const { data: cats } = await supabase
      .from('service_categories')
      .select('id, name, color')
      .in('id', catIds)
    if (cats) catMap = Object.fromEntries(cats.map(c => [c.id, c]))
  }

  const result = (data || []).map(s => ({
    ...s,
    category: catMap[s.category_id] || null
  }))
  res.json(result)
})

// GET /booking/:orgId/staff
router.get('/:orgId/staff', async (req, res) => {
  const { orgId } = req.params
  const { data, error } = await supabase
    .from('staff')
    .select('id, name, avatar_url, staff_categories(category_id)')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('name')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// GET /booking/:orgId/available-days?month=YYYY-MM — jours avec au moins 1 créneau dispo
router.get('/:orgId/available-days', async (req, res) => {
  const { orgId } = req.params
  const month = req.query.month || new Date().toISOString().slice(0, 7)
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()

  const DEFAULT_HOURS = { mon:{active:true,open:'09:00',close:'18:00'}, tue:{active:true,open:'09:00',close:'18:00'}, wed:{active:true,open:'09:00',close:'18:00'}, thu:{active:true,open:'09:00',close:'18:00'}, fri:{active:true,open:'09:00',close:'18:00'}, sat:{active:true,open:'09:00',close:'18:00'}, sun:{active:false,open:'09:00',close:'18:00'} }
  const openingHours = (await getOrgSettings(orgId)) || DEFAULT_HOURS
  const closures = await getClosures(orgId)
  const DAY_NAMES = ['sun','mon','tue','wed','thu','fri','sat']

  const available = []
  const today = new Date().toLocaleDateString('en-CA')

  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${month}-${String(d).padStart(2,'0')}`
    if (dateStr < today) continue
    if (closures.has(dateStr)) continue
    const dayName = DAY_NAMES[new Date(dateStr + 'T12:00:00').getDay()]
    const daySettings = openingHours?.[dayName]
    if (!daySettings?.active) continue
    available.push(dateStr)
  }

  res.json(available)
})

// GET /booking/:orgId/slots?date=YYYY-MM-DD&serviceId=
router.get('/:orgId/slots', async (req, res) => {
  const { orgId } = req.params
  const { date, serviceId, staffId } = req.query
  if (!date) return res.status(400).json({ error: 'date required' })

  // Check closure
  const closure = await getActiveClosure(orgId, date)
  if (closure) return res.json({ slots: [], closed: true, closure })

  // Opening hours
  const DEFAULT_HOURS = { mon:{active:true,open:'09:00',close:'18:00'}, tue:{active:true,open:'09:00',close:'18:00'}, wed:{active:true,open:'09:00',close:'18:00'}, thu:{active:true,open:'09:00',close:'18:00'}, fri:{active:true,open:'09:00',close:'18:00'}, sat:{active:true,open:'09:00',close:'18:00'}, sun:{active:false,open:'09:00',close:'18:00'} }
  const openingHours = (await getOrgSettings(orgId)) || DEFAULT_HOURS
  const DAY_NAMES = ['sun','mon','tue','wed','thu','fri','sat']
  const dayName = DAY_NAMES[new Date(date + 'T12:00:00').getDay()]
  const daySettings = openingHours?.[dayName]
  if (!daySettings?.active) return res.json({ slots: [], closed: true })

  const allSlots = buildHourlySlots(daySettings.open, daySettings.close)

  // Existing appointments for this org/date
  const { data: appts } = await supabase
    .from('appointments')
    .select('start_time, appointment_services(staff_id)')
    .eq('organization_id', orgId)
    .gte('start_time', `${date}T00:00:00`)
    .lte('start_time', `${date}T23:59:59`)
    .not('status', 'in', '("cancelled","no_show")')

  // Staff absences (no org_id on this table — filter via staff join)
  const { data: absences } = await supabase
    .from('staff_absences')
    .select('staff_id')
    .lte('start_date', date)
    .gte('end_date', date)

  const absentStaffIds = new Set((absences || []).map(a => a.staff_id))

  // Get competent staff for service
  let competentStaffIds = null
  if (serviceId) {
    const { data: svc } = await supabase
      .from('services')
      .select('category_id')
      .eq('id', serviceId)
      .maybeSingle()

    if (svc?.category_id) {
      const { data: sc } = await supabase
        .from('staff_categories')
        .select('staff_id, staff(is_active, organization_id)')
        .eq('category_id', svc.category_id)

      competentStaffIds = (sc || [])
        .filter(r => r.staff?.is_active && r.staff?.organization_id === orgId && !absentStaffIds.has(r.staff_id))
        .map(r => r.staff_id)
    }
  }

  // If specific staff requested, filter only that staff
  if (staffId) {
    competentStaffIds = competentStaffIds
      ? competentStaffIds.filter(id => id === staffId)
      : [staffId]
  }

  // Build slot availability
  const busyByStaff = {}
  for (const a of (appts || [])) {
    const slotTime = a.start_time.slice(11, 16)
    for (const s of (a.appointment_services || [])) {
      if (!s.staff_id) continue
      if (!busyByStaff[s.staff_id]) busyByStaff[s.staff_id] = new Set()
      busyByStaff[s.staff_id].add(slotTime)
    }
  }

  const now = new Date()
  const todayStr = now.toLocaleDateString('en-CA')
  const currentHour = now.getHours()

  const freeSlots = allSlots.filter(slot => {
    // Skip past slots for today
    if (date === todayStr && parseInt(slot) <= currentHour) return false

    // No competence model OR aucun staff compétent trouvé : logique simple
    if (!competentStaffIds || competentStaffIds.length === 0) {
      const busyCount = (appts || []).filter(a => a.start_time.slice(11, 16) === slot).length
      return busyCount === 0
    }

    // At least 1 competent, non-absent, non-busy staff available
    return competentStaffIds.some(sid => !busyByStaff[sid]?.has(slot))
  })

  res.json({ slots: freeSlots, closed: false })
})

// POST /booking/:orgId/appointments — créer un RDV public (multi-prestations)
router.post('/:orgId/appointments', async (req, res) => {
  const { orgId } = req.params
  const { name, last_name, phone, date, time, services } = req.body

  if (!name || !phone || !date || !time || !services?.length) {
    return res.status(400).json({ error: 'Champs requis manquants' })
  }

  const normalizedPhone = formatPhone(phone)

  // Upsert client
  let clientId
  const { data: existing } = await supabase
    .from('clients')
    .select('id')
    .eq('organization_id', orgId)
    .eq('phone', normalizedPhone)
    .maybeSingle()

  if (existing) {
    clientId = existing.id
  } else {
    const { data: newClient, error: cErr } = await supabase
      .from('clients')
      .insert({ organization_id: orgId, name: name.trim(), last_name: (last_name || '').trim() || null, phone: normalizedPhone })
      .select('id')
      .single()
    if (cErr) return res.status(500).json({ error: cErr.message })
    clientId = newClient.id
  }

  // Fetch all service infos
  const serviceIds = services.map(s => s.serviceId)
  const { data: svcRows, error: svcErr } = await supabase
    .from('services')
    .select('id, name, price, duration_minutes')
    .in('id', serviceIds)
  if (svcErr) return res.status(500).json({ error: svcErr.message })
  if (!svcRows?.length) return res.status(404).json({ error: 'Service(s) introuvable(s)' })

  const svcMap = Object.fromEntries(svcRows.map(s => [s.id, s]))

  // Create appointment
  const startTime = `${date}T${time}:00`
  const { data: appt, error: aErr } = await supabase
    .from('appointments')
    .insert({
      organization_id: orgId,
      client_id: clientId,
      start_time: startTime,
      status: 'scheduled',
      source: 'online',
      type: 'appointment'
    })
    .select('id')
    .single()
  if (aErr) return res.status(500).json({ error: aErr.message })

  // Create appointment_services (one row per service)
  const apptServices = services.map(s => ({
    appointment_id: appt.id,
    service_id: s.serviceId,
    staff_id: s.staffId || null,
    price_at_booking: svcMap[s.serviceId]?.price || null
  }))
  const { error: asErr } = await supabase.from('appointment_services').insert(apptServices)
  if (asErr) return res.status(500).json({ error: asErr.message })

  res.json({
    ok: true,
    appointment_id: appt.id,
    services: svcRows.map(s => s.name),
    date,
    time,
    client: name
  })
})

export default router
