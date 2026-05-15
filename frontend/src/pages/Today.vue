<script setup>
import { ref, onMounted, computed } from 'vue'
import AddWalkinModal from '../components/today/AddWalkinModal.vue'
import ServeWalkinModal from '../components/today/ServeWalkinModal.vue'
import EditAppointmentModal from '../components/today/EditAppointmentModal.vue'
import CustomSelect from '../components/common/CustomSelect.vue'
import DropdownActions from '../components/common/DropdownActions.vue'
import { completeAppointment } from '../services/today.service'
import { fetchStaff } from '../services/staff.service'
import { fetchServices } from '../services/services.service'
import { supabase } from '../lib/supabase'

// ── Date de test (dev uniquement) ──────────────────────────────────────────
const isDev = import.meta.env.DEV
const TEST_DATE_KEY = 'medsolutions_test_date'
const testDateOverride = ref(localStorage.getItem(TEST_DATE_KEY) || '')

function getToday() {
  return testDateOverride.value || new Date().toLocaleDateString('en-CA')
}

function getNowIso() {
  if (isDev && testDateOverride.value) {
    return testDateOverride.value + 'T' + new Date().toTimeString().substring(0, 8)
  }
  const now = new Date()
  return now.toLocaleDateString('en-CA') + 'T' + now.toTimeString().substring(0, 8)
}

function setTestDate(d) {
  testDateOverride.value = d
  if (d) localStorage.setItem(TEST_DATE_KEY, d)
  else localStorage.removeItem(TEST_DATE_KEY)
  fetchData()
}
// ────────────────────────────────────────────────────────────────────────────

const walkins      = ref([])
const staff        = ref([])
const services     = ref([])
const appointments = ref([])
const isLoading    = ref(true)

const showAddWalkin       = ref(false)
const showServeModal      = ref(false)
const showEditAppointment = ref(false)
const selectedWalkin      = ref(null)
const selectedAppointment = ref(null)

function openServe(w) { selectedWalkin.value = w; showServeModal.value = true }
function openEdit(a)  { selectedAppointment.value = a; showEditAppointment.value = true }

// ── Dialog annulation / suppression ────────────────────────────────────────
const cancelDialog = ref({ show: false, id: null, svcId: null, client: '' })

function openCancelDialog(id, client, svcId = null) {
  cancelDialog.value = { show: true, id, svcId, client }
}

// ── Confirmation générique ──────────────────────────────────────────────────
const confirmDialog = ref({ show: false, title: '', message: '', btnLabel: 'Confirmer', danger: false, onConfirm: null })

function showConfirm({ title, message, btnLabel = 'Confirmer', danger = false, onConfirm }) {
  confirmDialog.value = { show: true, title, message, btnLabel, danger, onConfirm }
}

function executeConfirm() {
  confirmDialog.value.onConfirm?.()
  confirmDialog.value.show = false
}

// Règle de statut : tout annulé → cancelled | tout fini/annulé (≥1 completed) → completed | sinon → in_progress
function apptStatusFromSvcs(svcs) {
  if (!svcs.length) return 'in_progress'
  const allCancelled      = svcs.every(s => s.status === 'cancelled')
  if (allCancelled) return 'cancelled'
  const allDoneOrCancelled = svcs.every(s => s.status === 'completed' || s.status === 'cancelled')
  if (allDoneOrCancelled) return 'completed'
  return 'in_progress'
}

async function handleCancelAction(action, directId, directSvcId) {
  const id    = directId    ?? cancelDialog.value.id
  const svcId = directSvcId ?? cancelDialog.value.svcId
  cancelDialog.value.show = false
  try {
    if (svcId) {
      const { data: allSvcs } = await supabase
        .from('appointment_services')
        .select('id, status')
        .eq('appointment_id', id)

      if (action === 'cancel') {
        await supabase.from('appointment_services').update({ status: 'cancelled' }).eq('id', svcId)
        const updated = (allSvcs || []).map(s => s.id === svcId ? { ...s, status: 'cancelled' } : s)
        const newStatus = apptStatusFromSvcs(updated)
        const apptUpdate = { status: newStatus }
        if (newStatus === 'cancelled' || newStatus === 'completed') apptUpdate.end_time = getNowIso()
        await supabase.from('appointments').update(apptUpdate).eq('id', id)
      } else {
        await supabase.from('appointment_services').delete().eq('id', svcId)
        const remaining = (allSvcs || []).filter(s => s.id !== svcId)
        if (remaining.length === 0) {
          await supabase.from('appointments').delete().eq('id', id)
        } else {
          const newStatus = apptStatusFromSvcs(remaining)
          await supabase.from('appointments').update({ status: newStatus }).eq('id', id)
        }
      }
    } else {
      if (action === 'cancel') {
        await supabase.from('appointments').update({ status: 'cancelled', end_time: getNowIso() }).eq('id', id)
      } else {
        await supabase.from('appointments').delete().eq('id', id)
      }
    }
    await fetchData()
  } catch(e) { console.error(e) }
}
// ────────────────────────────────────────────────────────────────────────────

const flaggedClientIds = ref(new Set())

async function loadFlaggedClients() {
  const [{ data: badAppts }, { data: clients }] = await Promise.all([
    supabase.from('appointments').select('client_id').in('status', ['cancelled', 'no_show']),
    supabase.from('clients').select('id, flag_dismissed_count')
  ])
  if (!badAppts || !clients) return
  // Compter les mauvaises actions par client
  const counts = {}
  for (const a of badAppts) {
    if (a.client_id) counts[a.client_id] = (counts[a.client_id] || 0) + 1
  }
  const dismissed = {}
  for (const c of clients) dismissed[c.id] = c.flag_dismissed_count || 0

  const ids = new Set()
  for (const [clientId, total] of Object.entries(counts)) {
    if (total >= 2 && total > (dismissed[clientId] || 0)) ids.add(clientId)
  }
  flaggedClientIds.value = ids
}

const fetchData = async () => {
  try {
    isLoading.value = true
    const today = getToday()
    const SELECT_APPT = `*, client:client_id(id, name, last_name), appointment_services(id, status, staff_id, service:service_id(id, name, duration_minutes), staff:staff_id(id, name))`

    // Plage : 60 derniers jours → aujourd'hui (pour carry-over multi-jours)
    const cutoffDate = new Date(today + 'T12:00:00')
    cutoffDate.setDate(cutoffDate.getDate() - 60)
    const cutoff = cutoffDate.toLocaleDateString('en-CA')

    const [staffRes, servicesRes, { data: allAppts }] = await Promise.all([
      fetchStaff(),
      fetchServices(),
      supabase.from('appointments').select(SELECT_APPT)
        .gte('start_time', cutoff + 'T00:00:00')
        .lte('start_time', today + 'T23:59:59')
        .order('start_time', { ascending: true })
    ])

    staff.value    = staffRes
    services.value = servicesRes

    const all = allAppts || []
    const seen = new Set()
    const result = []

    for (const a of all) {
      if (seen.has(a.id)) continue
      const startDate = (a.start_time || '').slice(0, 10)
      const endDate   = (a.end_time   || '').slice(0, 10)
      const terminal  = ['completed', 'cancelled', 'no_show'].includes(a.status)

      if (startDate === today) {
        // RDV du jour → toujours inclus
        seen.add(a.id); result.push(a)
      } else if (startDate < today && !terminal) {
        // Carry-over : démarré avant aujourd'hui, pas encore clôturé
        seen.add(a.id); result.push(a)
      } else if (startDate < today && terminal && endDate === today) {
        // Clôturé aujourd'hui (annulé/terminé ce jour, démarré avant)
        seen.add(a.id); result.push(a)
      }
    }

    appointments.value = result
    const apptRes = all.filter(a => (a.start_time || '').slice(0, 10) === today)
    await loadFlaggedClients()
    walkins.value = appointments.value
      .filter(a => a.type === 'walkin' && a.status === 'waiting')
      .map(w => ({
        id:        w.id,
        time:      w.start_time?.substring(11, 16) || '--:--',
        client:    w.client?.name || w.walkin_name || 'Inconnu',
        service:   w.appointment_services?.[0]?.service?.name || null,
        isFlagged: flaggedClientIds.value.has(w.client?.id),
        raw:       w
      }))
  } catch (e) {
    console.error('Error loading dashboard:', e)
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchData)

function isForStaff(a, sm) {
  if (a.appointment_services?.some(as => as.staff?.id === sm.id)) return true
  return a.staff_id === sm.id
}

function mapApptWithSvc(a, svc) {
  const svcDone = svc?.status === 'completed'
  const svcCancelled = svc?.status === 'cancelled'
  const status = a.status === 'cancelled' ? 'cancelled'
    : a.status === 'no_show'             ? 'noshow'
    : svcCancelled                        ? 'cancelled'
    : svcDone                             ? 'past'
    : a.status === 'in_progress'          ? 'current'
    : a.status === 'completed'            ? 'past'
    : 'upcoming'
  return {
    id:         a.id,
    svcId:      svc?.id || null,
    svcDone,
    time:       (a.start_time?.substring(11, 16) || '') + (a.end_time ? '–' + a.end_time.substring(11, 16) : ''),
    client:     ((a.client?.name || '') + ' ' + (a.client?.last_name || '')).trim() || a.walkin_name || '—',
    service:    svc?.service?.name || 'Prestation non définie',
    duration:   svc?.service?.duration_minutes || null,
    status,
    isExternal: !!a.is_external,
    isFlagged:  flaggedClientIds.value.has(a.client?.id),
    raw:        a
  }
}

// Un RDV terminé/annulé est visible si sa date de clôture est aujourd'hui
function isToday(a) {
  const ts = a.end_time || a.start_time || ''
  if (!ts) return false
  return new Date(ts).toLocaleDateString('en-CA') === getToday()
}

const showCompleted = ref(true)

function isSvcVisible(a, svc) {
  if (a.status === 'cancelled') {
    return isToday(a) && showCompleted.value
  }
  if (svc?.status === 'cancelled') {
    return showCompleted.value
  }
  if (a.status === 'completed') {
    return isToday(a) && showCompleted.value
  }
  if (svc?.status === 'completed') {
    return showCompleted.value
  }
  return true
}

function terminalOrder(status) {
  if (status === 'past' || status === 'cancelled' || status === 'noshow') return 1
  return 0
}

// Une ligne par appointment_service assigné à ce staff
function staffAppts(sm) {
  const rows = []
  for (const a of appointments.value) {
    if (a.type === 'walkin') continue
    const allSvcs = a.appointment_services || []
    const hasSvcs = allSvcs.length > 0
    // Comparer staff?.id ET staff_id direct (si le join staff est null mais staff_id est présent)
    const svcs = allSvcs.filter(as => (as.staff?.id ?? as.staff_id) === sm.id)
    if (svcs.length > 0) {
      for (const svc of svcs) {
        if (isSvcVisible(a, svc)) rows.push(mapApptWithSvc(a, svc))
      }
    } else if (!hasSvcs && a.staff_id === sm.id) {
      // Appointment sans aucune appointment_service — fallback staff_id direct
      if (isSvcVisible(a, null)) rows.push(mapApptWithSvc(a, null))
    }
  }
  return rows.sort((a, b) => terminalOrder(a.status) - terminalOrder(b.status))
}

function staffWalkins(sm) {
  const rows = []
  for (const a of appointments.value) {
    if (a.type !== 'walkin' || a.status === 'waiting') continue
    const allSvcs = a.appointment_services || []
    const hasSvcs = allSvcs.length > 0
    const svcs = allSvcs.filter(as => (as.staff?.id ?? as.staff_id) === sm.id)
    if (svcs.length > 0) {
      for (const svc of svcs) {
        if (isSvcVisible(a, svc)) rows.push(mapApptWithSvc(a, svc))
      }
    } else if (!hasSvcs && a.staff_id === sm.id) {
      if (isSvcVisible(a, null)) rows.push(mapApptWithSvc(a, null))
    }
  }
  return rows.sort((a, b) => terminalOrder(a.status) - terminalOrder(b.status))
}

const PERIOD_LABELS = { morning: 'Matin', afternoon: 'Après-midi', evening: 'Soir' }

function staffExternalRdvs(sm) {
  const today = getToday()
  return appointments.value.filter(a =>
    a.is_external &&
    a.status !== 'cancelled' &&
    a.appointment_services?.some(as => as.staff?.id === sm.id)
  ).map(a => {
    const date = (a.start_time || '').slice(0, 10)
    const period = a.external_period ? PERIOD_LABELS[a.external_period] : null
    return { id: a.id, label: `RDV externe${period ? ' – ' + period : ''}`, isToday: date === today }
  })
}

function isAbsentToday(sm) {
  const today = getToday()
  return sm.absences?.some(a => a.start_date <= today && a.end_date >= today)
}

function staffColor(sm) {
  const active = [...staffAppts(sm), ...staffWalkins(sm)].filter(a => a.status !== 'past' && a.status !== 'cancelled' && a.status !== 'noshow').length
  if (active === 0) return 'free'
  if (active <= 2)  return 'busy'
  if (active <= 5)  return 'loaded'
  return 'full'
}

function timeToMin(str) {
  const t = str?.length > 5 ? str.substring(11, 16) : (str || '00:00')
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function rowsOverlap(a, b) {
  if (!a.raw.start_time || !b.raw.start_time) return false
  const aStartMin = timeToMin(a.raw.start_time)
  const aDur      = a.raw.appointment_services?.find(s => s.id === a.svcId)?.service?.duration_minutes || 0
  const bStartMin = timeToMin(b.raw.start_time)
  const bDur      = b.raw.appointment_services?.find(s => s.id === b.svcId)?.service?.duration_minutes || 0
  if (!aDur || !bDur) return false
  return aStartMin < bStartMin + bDur && aStartMin + aDur > bStartMin
}

function overlappingSvcIds(sm) {
  const active = staffAppts(sm).filter(r => r.status !== 'past' && r.status !== 'cancelled')
  const result = new Set()
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      if (rowsOverlap(active[i], active[j])) {
        result.add(active[i].svcId)
        result.add(active[j].svcId)
      }
    }
  }
  return result
}

function staffHasOverlap(sm) {
  return overlappingSvcIds(sm).size > 0
}

async function noShow(apptId) {
  try {
    await supabase.from('appointment_services').update({ status: 'cancelled' }).eq('appointment_id', apptId)
    await supabase.from('appointments').update({ status: 'no_show', end_time: getNowIso() }).eq('id', apptId)
    await fetchData()
  } catch(e) { console.error(e) }
}

async function cancelAppt(apptId) {
  try {
    await supabase.from('appointment_services').update({ status: 'cancelled' }).eq('appointment_id', apptId)
    await supabase.from('appointments').update({ status: 'cancelled', end_time: getNowIso() }).eq('id', apptId)
    await fetchData()
  } catch(e) { console.error(e) }
}

async function deleteAppt(apptId) {
  try {
    await supabase.from('appointment_services').delete().eq('appointment_id', apptId)
    await supabase.from('appointments').delete().eq('id', apptId)
    await fetchData()
  } catch(e) { console.error(e) }
}

const SVG_NOSHOW  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M8 15s1.5-2 4-2 4 2 4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`
const SVG_CANCEL  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
const SVG_DELETE  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`

function apptActions(a) {
  return [
    {
      label: 'No show', icon: SVG_NOSHOW,
      onClick: () => showConfirm({
        title: 'No show', message: `Confirmer l'absence de ${a.client} ?`,
        btnLabel: 'Confirmer', danger: false,
        onConfirm: () => noShow(a.id)
      })
    },
    {
      label: 'Annuler', icon: SVG_CANCEL, class: 'danger',
      onClick: () => showConfirm({
        title: 'Annuler le RDV', message: `Annuler le RDV de ${a.client} ?`,
        btnLabel: 'Annuler le RDV', danger: true,
        onConfirm: () => cancelAppt(a.id)
      })
    },
    {
      label: 'Supprimer', icon: SVG_DELETE, class: 'danger',
      onClick: () => showConfirm({
        title: 'Supprimer', message: `Supprimer définitivement le RDV de ${a.client} ?`,
        btnLabel: 'Supprimer', danger: true,
        onConfirm: () => deleteAppt(a.id)
      })
    },
  ]
}


async function finish(apptId, svcId) {
  try {
    const nowIso = getNowIso()
    if (svcId) {
      await supabase.from('appointment_services').update({ status: 'completed' }).eq('id', svcId)
      // Récupérer tous les services après mise à jour
      const { data: allSvcs } = await supabase
        .from('appointment_services')
        .select('id, status')
        .eq('appointment_id', apptId)
      const updated = (allSvcs || []).map(s => s.id === svcId ? { ...s, status: 'completed' } : s)
      // Considérer les cancelled comme "hors-jeu" : si tous les restants sont completed → terminer
      const stillActive = updated.filter(s => s.status !== 'completed' && s.status !== 'cancelled')
      if (stillActive.length === 0) {
        await completeAppointment(apptId, nowIso)
      }
    } else {
      await completeAppointment(apptId, nowIso)
    }
    await fetchData()
  } catch(e) { console.error(e) }
}

const todayLabel = computed(() =>
  new Date(getToday() + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
)

const collapsed = ref({})
function toggleCollapse(id) { collapsed.value[id] = !collapsed.value[id] }
function collapseAll()      { staff.value.forEach(sm => { collapsed.value[sm.id] = true  }) }
function expandAll()        { staff.value.forEach(sm => { collapsed.value[sm.id] = false }) }

const unassigned = computed(() => {
  const rows = []
  for (const a of appointments.value) {
    if (a.type === 'walkin') continue
    if (['completed', 'cancelled', 'no_show'].includes(a.status)) continue
    const client = ((a.client?.name || '') + ' ' + (a.client?.last_name || '')).trim() || a.walkin_name || 'Client'
    const time = a.start_time?.substring(11, 16) || '—'
    const date = a.start_time?.substring(0, 10) || ''
    if (!a.appointment_services?.length) {
      if (!a.staff_id) rows.push({ id: a.id, svcId: null, time, date, client, service: 'Prestation non définie', serviceId: null, isHeavy: false, appointmentServiceId: null })
    } else {
      for (const as of a.appointment_services) {
        if (!as.staff?.id && !as.staff_id && as.status !== 'cancelled' && as.status !== 'completed') {
          const svcDef = services.value.find(s => s.id === as.service?.id)
          rows.push({ id: a.id, svcId: as.id, time, date, client, service: as.service?.name || 'Prestation non définie', serviceId: as.service?.id || null, isHeavy: !!svcDef?.is_heavy, categoryId: svcDef?.category_id || null, appointmentServiceId: as.id })
        }
      }
    }
  }
  return rows
})

function staffForUnassigned(row) {
  const { date, categoryId } = row
  const mapped = staff.value.map(s => {
    const absent = date && s.absences?.some(a => a.start_date <= date && a.end_date >= date)
    const competent = categoryId && s.categories?.some(c => c.id === categoryId)
    return { ...s, _absent: !!absent, _competent: !!competent,
      disabled: absent ? true : undefined,
      hint: absent ? 'En congé' : undefined
    }
  })
  const competent = mapped.filter(s => s._competent && !s._absent)
  const others    = mapped.filter(s => !s._competent && !s._absent)
  const absent    = mapped.filter(s => s._absent)
  const result = []
  if (competent.length && (others.length || absent.length)) {
    result.push(...competent)
    result.push({ id: '__sep__', name: '── Autres ──', disabled: true })
  } else {
    result.push(...competent)
  }
  result.push(...others)
  result.push(...absent)
  return result
}

const heavyAssignWarning = ref('')

async function assignStaffWithCheck(row, staffId) {
  if (!staffId || staffId === '__sep__') return
  if (row.isHeavy && row.categoryId) {
    const sm = staff.value.find(s => s.id === staffId)
    if (sm && !sm.categories?.some(c => c.id === row.categoryId)) {
      heavyAssignWarning.value = `"${row.service}" est une prestation complexe — ${sm.name} n'a pas la compétence requise. Confirmer quand même ?`
      pendingHeavyAssign.value = { row, staffId }
      return
    }
  }
  await assignStaff(row, staffId)
}

const pendingHeavyAssign = ref(null)

async function confirmHeavyAssign() {
  if (!pendingHeavyAssign.value) return
  const { row, staffId } = pendingHeavyAssign.value
  heavyAssignWarning.value = ''
  pendingHeavyAssign.value = null
  await assignStaff(row, staffId)
}

const pendingStaff = ref({})
const assigningId  = ref(null)

async function assignStaff(appt, staffId) {
  if (!staffId) return
  const key = appt.svcId || appt.id
  assigningId.value = key
  try {
    if (appt.appointmentServiceId) {
      await supabase.from('appointment_services').update({ staff_id: staffId }).eq('id', appt.appointmentServiceId)
    } else {
      await supabase.from('appointment_services').insert({ appointment_id: appt.id, staff_id: staffId })
    }
    await supabase.from('appointments').update({ staff_id: staffId }).eq('id', appt.id)
    await fetchData()
  } catch(e) {
    console.error(e)
  } finally {
    assigningId.value = null
    delete pendingStaff.value[key]
  }
}

const stats = computed(() => ({
  waiting:    walkins.value.length,
  inProgress: appointments.value.filter(a => a.status === 'in_progress').length,
  completed:  appointments.value.filter(a => a.status === 'completed').length,
  total:      appointments.value.filter(a => a.type !== 'walkin').length
}))
</script>

<template>
  <div class="page today-page">

    <!-- Header -->
    <div class="page-header">
      <div>
        <div class="date-chip">{{ todayLabel }}</div>
        <h1 class="page-title" style="margin-top:6px;">Aujourd'hui</h1>
      </div>
      <button class="btn btn-primary" @click="showAddWalkin = true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Nouveau sans RDV
      </button>
    </div>

    <!-- Stats -->
    <div class="stats-bar">
      <div class="stat">
        <div class="stat-num" style="color:#f59e0b">{{ stats.waiting }}</div>
        <div class="stat-lbl">En attente</div>
      </div>
      <div class="stat-div"></div>
      <div class="stat">
        <div class="stat-num" style="color:#3b82f6">{{ stats.inProgress }}</div>
        <div class="stat-lbl">En cours</div>
      </div>
      <div class="stat-div"></div>
      <div class="stat">
        <div class="stat-num" style="color:#22c55e">{{ stats.completed }}</div>
        <div class="stat-lbl">Terminés</div>
      </div>
      <div class="stat-div"></div>
      <div class="stat">
        <div class="stat-num">{{ stats.total }}</div>
        <div class="stat-lbl">RDV du jour</div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Chargement…</span>
    </div>

    <!-- RDVs non affectés -->
    <div v-if="!isLoading && unassigned.length" class="unassigned-section">
      <div class="unassigned-header">
        <div class="unassigned-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <span class="unassigned-title">{{ unassigned.length }} prestation{{ unassigned.length > 1 ? 's' : '' }} sans collaborateur</span>
        <span class="unassigned-sub">À affecter à un collaborateur</span>
      </div>
      <div class="unassigned-list">
        <div v-for="a in unassigned" :key="a.svcId || a.id" class="unassigned-row">
          <div class="ua-time">{{ a.time }}</div>
          <div class="ua-info">
            <div class="ua-client">{{ a.client }}</div>
            <div class="ua-service">
              {{ a.service }}
              <span v-if="a.isHeavy" class="ua-heavy-badge">Complexe</span>
            </div>
          </div>
          <div class="ua-assign">
            <CustomSelect
              v-model="pendingStaff[a.svcId || a.id]"
              :options="staffForUnassigned(a)"
              placeholder="Choisir un collaborateur…"
              :iconType="'none'"
              @update:modelValue="(v) => assignStaffWithCheck(a, v)"
            />
            <div v-if="assigningId === (a.svcId || a.id)" class="ua-saving">
              <div class="mini-spinner"></div>
            </div>
          </div>
          <DropdownActions @click.stop :actions="[
            { label: 'No show', icon: SVG_NOSHOW, onClick: () => showConfirm({ title: 'No show', message: `Confirmer l\'absence de ${a.client} ?`, btnLabel: 'Confirmer', danger: false, onConfirm: () => noShow(a.id) }) },
            { label: 'Annuler', icon: SVG_CANCEL, class: 'danger', onClick: () => showConfirm({ title: 'Annuler le RDV', message: `Annuler le RDV de ${a.client} ?`, btnLabel: 'Annuler le RDV', danger: true, onConfirm: () => cancelAppt(a.id) }) },
            { label: 'Supprimer', icon: SVG_DELETE, class: 'danger', onClick: () => showConfirm({ title: 'Supprimer', message: `Supprimer définitivement le RDV de ${a.client} ?`, btnLabel: 'Supprimer', danger: true, onConfirm: () => deleteAppt(a.id) }) }
          ]" />
        </div>
      </div>
    </div>

    <div v-if="!isLoading" class="main-grid">

      <!-- ── FILE D'ATTENTE ── -->
      <section class="panel queue-panel">
        <div class="panel-header">
          <span class="panel-title">File d'attente</span>
          <span class="queue-badge" :class="{ active: walkins.length > 0 }">{{ walkins.length }}</span>
        </div>

        <div v-if="walkins.length" class="queue-list">
          <div v-for="(w, i) in walkins" :key="w.id" class="queue-row">
            <div class="queue-rank">{{ i + 1 }}</div>
            <div class="queue-body">
              <div class="queue-client">
                {{ w.client }}
                <span v-if="w.isFlagged" class="flag-badge-inline" title="Client signalé">⚠</span>
              </div>
              <div class="queue-service">{{ w.service || 'Prestation à définir' }}</div>
              <div class="queue-time">Arrivée {{ w.time }}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button class="btn-serve" @click="openServe(w)">
                Servir
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
              <button class="btn-cancel-walkin" @click="openCancelDialog(w.id, w.client)" title="Annuler">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div v-else class="queue-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="20 6 9 17 4 12"/></svg>
          <p>File vide</p>
        </div>
      </section>

      <!-- ── COLLABORATEURS ── -->
      <section class="staff-section">
        <div v-if="staff.length" class="staff-controls">
          <label class="toggle-completed">
            <input type="checkbox" v-model="showCompleted" />
            <span>Afficher les prestations terminées</span>
          </label>
          <div style="display:flex;gap:8px;margin-left:auto">
            <button class="ctrl-btn" @click="expandAll()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="7 14 12 9 17 14"/></svg>
              Tout déployer
            </button>
            <button class="ctrl-btn" @click="collapseAll()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="7 10 12 15 17 10"/></svg>
              Tout réduire
            </button>
          </div>
        </div>
        <div v-if="!staff.length" class="panel">
          <p style="text-align:center;color:var(--text-light);padding:32px">Aucun collaborateur actif</p>
        </div>

        <div v-for="sm in staff" :key="sm.id" class="staff-panel" :class="isAbsentToday(sm) ? 'absent' : staffColor(sm)">

          <div v-if="isAbsentToday(sm)" class="absent-banner">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            En congé aujourd'hui — non disponible
          </div>

          <div v-for="ext in staffExternalRdvs(sm)" :key="'ext-' + ext.id" class="external-banner" :class="{ 'external-today': ext.isToday }">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            {{ ext.label }}
          </div>

          <div class="staff-head" @click="toggleCollapse(sm.id)" style="cursor:pointer;">
            <div class="staff-initials">{{ sm.name.charAt(0).toUpperCase() }}</div>
            <div class="staff-name">{{ sm.name }}</div>
            <span class="staff-status" :class="{ 'status-absent': isAbsentToday(sm) }">
              {{ isAbsentToday(sm) ? 'En congé' : staffColor(sm) === 'free' ? 'Disponible' : staffColor(sm) === 'busy' ? 'En cours' : staffColor(sm) === 'loaded' ? 'Chargé' : 'Complet' }}
            </span>
            <span v-if="staffHasOverlap(sm)" class="overlap-badge">⚠ Chevauchement</span>
            <svg class="chevron" :class="{ rotated: collapsed[sm.id] }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>

          <div class="appt-list" v-show="!collapsed[sm.id]">
            <template v-if="staffAppts(sm).length">
              <div v-for="a in staffAppts(sm)" :key="a.svcId || a.id" class="appt-row clickable" :class="[a.status, { 'overlapping': overlappingSvcIds(sm).has(a.svcId) }]" @click="openEdit(a)">
                <div class="appt-time">{{ a.time }}</div>
                <div class="appt-body">
                  <div class="appt-client">
                    {{ a.client }}
                    <span v-if="a.isFlagged" class="flag-badge-inline" title="Client signalé">⚠</span>
                    <span v-if="a.isExternal" class="badge-ext">Externe</span>
                  </div>
                  <div class="appt-service">{{ a.service }}<span v-if="a.duration" class="svc-duration"> · {{ a.duration }}min</span></div>
                </div>
                <span v-if="a.status === 'cancelled'" class="status-badge status-badge--cancelled">Annulé</span>
                <span v-else-if="a.status === 'past'" class="status-badge status-badge--done">Terminé</span>
                <span v-else-if="a.status === 'noshow'" class="status-badge status-badge--noshow">No show</span>
                <template v-else>
                  <button class="btn-finish" @click.stop="finish(a.id, a.svcId)">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                    Terminer
                  </button>
                  <DropdownActions @click.stop :actions="apptActions(a)" />
                </template>
              </div>
            </template>
            <div v-else class="appt-empty">Aucun RDV planifié</div>

            <template v-if="staffWalkins(sm).length">
              <div class="walkin-separator">Sans rendez-vous</div>
              <div v-for="w in staffWalkins(sm)" :key="w.svcId || w.id" class="appt-row walkin clickable" :class="w.status" @click="openEdit(w)">
                <div class="appt-time">{{ w.time || '—' }}</div>
                <div class="appt-body">
                  <div class="appt-client">
                    {{ w.client }}
                    <span v-if="w.isFlagged" class="flag-badge-inline" title="Client signalé">⚠</span>
                  </div>
                  <div class="appt-service">{{ w.service }}</div>
                </div>
                <span v-if="w.status === 'cancelled'" class="status-badge status-badge--cancelled">Annulé</span>
                <span v-else-if="w.status === 'past'" class="status-badge status-badge--done">Terminé</span>
                <template v-else>
                  <button class="btn-finish" @click.stop="finish(w.id, w.svcId)">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                    Terminer
                  </button>
                  <button class="btn-delete-walkin" title="Supprimer" @click.stop="showConfirm({ title: 'Supprimer', message: `Supprimer définitivement le service de ${w.client} ?`, btnLabel: 'Supprimer', danger: true, onConfirm: () => deleteAppt(w.id) })">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  </button>
                </template>
              </div>
            </template>
          </div>

        </div>
      </section>

    </div>

    <!-- Modals -->
    <AddWalkinModal v-if="showAddWalkin" :today="testDateOverride" @close="showAddWalkin = false" @refresh="fetchData" />
    <ServeWalkinModal v-if="showServeModal" :walkin="selectedWalkin" :staff="staff" :services="services" @close="showServeModal = false" @refresh="fetchData" />
    <EditAppointmentModal v-if="showEditAppointment" :appointment="selectedAppointment" :staff="staff" :services="services" @close="showEditAppointment = false" @refresh="fetchData" />

    <!-- Confirmation générique -->
    <Teleport to="body">
      <div v-if="confirmDialog.show" class="overlay" @click.self="confirmDialog.show = false">
        <div class="cancel-dialog">
          <h3 class="cancel-dialog-title">{{ confirmDialog.title }}</h3>
          <p class="cancel-dialog-sub">{{ confirmDialog.message }}</p>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
            <button
              class="btn"
              :class="confirmDialog.danger ? 'btn-danger' : 'btn-primary'"
              style="width:100%;justify-content:center"
              @click="executeConfirm"
            >{{ confirmDialog.btnLabel }}</button>
            <button class="btn btn-secondary" style="width:100%;justify-content:center" @click="confirmDialog.show = false">Retour</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Dialog annulation / suppression (file d'attente) -->
    <Teleport to="body">
      <div v-if="cancelDialog.show" class="overlay" @click.self="cancelDialog.show = false">
        <div class="cancel-dialog">
          <div class="cancel-dialog-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <h3 class="cancel-dialog-title">{{ cancelDialog.client }}</h3>
          <p class="cancel-dialog-sub">Que souhaitez-vous faire ?</p>
          <button class="cancel-opt cancel-opt--tag" @click="handleCancelAction('cancel')">
            <div class="cancel-opt-icon">✕</div>
            <div>
              <div class="cancel-opt-label">Marquer comme annulé</div>
              <div class="cancel-opt-desc">Le rendez-vous reste visible avec le statut "Annulé"</div>
            </div>
          </button>
          <button class="cancel-opt cancel-opt--delete" @click="handleCancelAction('delete')">
            <div class="cancel-opt-icon">🗑</div>
            <div>
              <div class="cancel-opt-label">Supprimer définitivement</div>
              <div class="cancel-opt-desc">Mauvaise saisie — efface le rendez-vous de la base</div>
            </div>
          </button>
          <button class="btn btn-secondary" style="width:100%;margin-top:4px" @click="cancelDialog.show = false">Retour</button>
        </div>
      </div>
    </Teleport>

    <!-- Panneau de test (dev uniquement) -->
    <div v-if="isDev" class="dev-date-panel">
      <span class="dev-label">🧪 Date de test</span>
      <input type="date" class="dev-date-input" :value="testDateOverride" @change="setTestDate($event.target.value)" />
      <button v-if="testDateOverride" class="dev-reset-btn" @click="setTestDate('')">Réinitialiser</button>
    </div>

    <!-- Alerte compétence affectation -->
    <div v-if="heavyAssignWarning" class="overlay" @click.self="heavyAssignWarning = ''; pendingHeavyAssign = null">
      <div class="cancel-dialog">
        <h3 class="cancel-dialog-title">Prestation complexe</h3>
        <p class="cancel-dialog-sub">{{ heavyAssignWarning }}</p>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;">
          <button class="btn btn-primary" style="width:100%;justify-content:center" @click="confirmHeavyAssign">Confirmer quand même</button>
          <button class="btn btn-secondary" style="width:100%;justify-content:center" @click="heavyAssignWarning = ''; pendingHeavyAssign = null">Modifier</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.today-page { padding-bottom: 48px; }

.date-chip {
  display: inline-flex; align-items: center;
  background: #fff; border: 1px solid var(--border); border-radius: 999px;
  padding: 4px 12px; font-size: 12px; font-weight: 600;
  color: var(--text-muted); text-transform: capitalize;
}

/* ── STATS ── */
.stats-bar {
  display: flex; align-items: center;
  background: #fff; border: 1px solid var(--border); border-radius: 12px;
  padding: 20px 32px; margin-bottom: 24px;
}
.stat     { flex: 1; text-align: center; }
.stat-num { font-size: 32px; font-weight: 800; line-height: 1; }
.stat-lbl { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; margin-top: 4px; }
.stat-div { width: 1px; height: 44px; background: var(--border); }

/* ── LOADING ── */
.loading-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 80px 0; color: var(--text-muted); }
.spinner { width: 28px; height: 28px; border: 3px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── GRILLE ── */
.main-grid {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 20px;
  align-items: start;
}

/* ── PANEL générique ── */
.panel { background: #fff; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid var(--border); background: var(--bg-main);
}
.panel-title { font-size: 13px; font-weight: 700; color: var(--text-main); }

/* ── FILE D'ATTENTE ── */
.queue-panel { background: #fff; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }

.queue-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 22px; height: 22px; padding: 0 6px;
  border-radius: 999px; font-size: 11px; font-weight: 700;
  background: var(--bg-main); border: 1px solid var(--border); color: var(--text-muted);
}
.queue-badge.active { background: #fef3c7; border-color: #fde68a; color: #92400e; }

.queue-list { display: flex; flex-direction: column; }
.queue-row {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; border-bottom: 1px solid var(--border); transition: background .15s;
}
.queue-row:last-child { border-bottom: none; }
.queue-row:hover { background: var(--bg-main); }

.queue-rank {
  width: 26px; height: 26px; border-radius: 50%;
  background: var(--bg-main); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: var(--text-muted); flex-shrink: 0;
}
.queue-body    { flex: 1; min-width: 0; }
.queue-client  { font-size: 14px; font-weight: 700; color: var(--text-main); }
.queue-service { font-size: 12px; color: var(--text-muted); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.queue-time    { font-size: 11px; color: var(--text-light); margin-top: 2px; }

.btn-serve {
  display: flex; align-items: center; gap: 5px;
  background: var(--primary); color: #fff;
  border: none; padding: 8px 13px; border-radius: 8px;
  font-size: 12.5px; font-weight: 700; cursor: pointer;
  white-space: nowrap; flex-shrink: 0; transition: background .15s;
}
.btn-serve:hover { background: var(--primary-dark); }

.btn-cancel-walkin {
  display: flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 8px;
  border: 1.5px solid #fca5a5; background: transparent;
  color: #dc2626; cursor: pointer; flex-shrink: 0; transition: all .15s;
}
.btn-cancel-walkin:hover { background: #fee2e2; border-color: #f87171; }

.queue-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 36px 20px; color: var(--text-light); }
.queue-empty p { font-size: 13px; font-weight: 600; margin: 0; }

/* ── SECTION STAFF ── */
.staff-section { display: flex; flex-direction: column; gap: 12px; }

.staff-controls { display: flex; align-items: center; gap: 8px; }
.toggle-completed {
  display: flex; align-items: center; gap: 6px;
  font-size: 12.5px; font-weight: 600; color: var(--text-muted);
  cursor: pointer; user-select: none;
}
.toggle-completed input[type=checkbox] { width: 14px; height: 14px; accent-color: var(--primary); cursor: pointer; }

.ctrl-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 12px; border: 1.5px solid var(--border); border-radius: 8px;
  background: #fff; color: var(--text-light);
  font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s;
}
.ctrl-btn:hover { background: #f1f5f9; color: var(--text); border-color: #cbd5e1; }

.staff-panel {
  background: #fff; border: 1px solid var(--border); border-radius: 12px;
  overflow: hidden; border-left-width: 4px;
}
.staff-panel.free   { border-left-color: #22c55e; }
.staff-panel.busy   { border-left-color: #3b82f6; }
.staff-panel.loaded { border-left-color: #f59e0b; }
.staff-panel.full   { border-left-color: #ef4444; }
.staff-panel.absent { border-left-color: #94a3b8; opacity: 0.75; }

.external-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 16px; font-size: 12px; font-weight: 600;
  background: #eff6ff; color: #1d4ed8;
  border-bottom: 1px solid #bfdbfe;
}
.external-banner.external-today { background: #fef3c7; color: #92400e; border-bottom-color: #fde68a; }

.absent-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px; background: #fee2e2; color: #dc2626;
  font-size: 12.5px; font-weight: 700; border-bottom: 1px solid #fca5a5;
}

.status-absent { background: #fee2e2 !important; color: #dc2626 !important; }

.staff-head {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; border-bottom: 1px solid var(--border); background: var(--bg-main);
}
.staff-initials {
  width: 38px; height: 38px; border-radius: 10px;
  background: var(--primary-soft); color: var(--primary-text);
  font-size: 16px; font-weight: 800;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.staff-name { font-size: 15px; font-weight: 700; color: var(--text-main); flex: 1; }
.chevron { color: var(--text-muted); flex-shrink: 0; transition: transform .2s; }
.chevron.rotated { transform: rotate(180deg); }
.staff-status {
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
  padding: 3px 9px; border-radius: 999px;
}
.free   .staff-status { background: #dcfce7; color: #166534; }
.busy   .staff-status { background: #dbeafe; color: #1e40af; }
.loaded .staff-status { background: #fef3c7; color: #92400e; }
.full   .staff-status { background: #fee2e2; color: #991b1b; }

/* ── LISTE APPOINTMENTS ── */
.appt-list  { display: flex; flex-direction: column; }
.appt-empty { padding: 14px 16px; font-size: 13px; color: var(--text-light); font-style: italic; }

.appt-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; border-bottom: 1px solid var(--border);
}
.appt-row:last-child { border-bottom: none; }
.appt-row.current   { background: #f0fdf4; }
.appt-row.past      { opacity: .5; }
.appt-row.cancelled { background: #fef2f2; opacity: .75; }
.appt-row.walkin    { background: #fafafa; }
.appt-row.clickable { cursor: pointer; }
.appt-row.clickable:hover         { background: #f8fafc; }
.appt-row.clickable.current:hover { background: #dcfce7; }
.appt-row.clickable.past:hover    { opacity: 1; background: #f8fafc; }

.appt-time { font-size: 12px; font-weight: 800; color: var(--text-muted); min-width: 80px; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.appt-body { flex: 1; min-width: 0; }
.appt-client  { font-size: 14px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 7px; }
.appt-service { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

.badge-ext { font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 999px; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
.flag-badge-inline { font-size: 12px; color: #b45309; flex-shrink: 0; }

.btn-finish {
  display: flex; align-items: center; gap: 5px;
  background: #1e293b; color: #fff;
  border: none; padding: 6px 13px; border-radius: 7px;
  font-size: 12px; font-weight: 700; cursor: pointer;
  white-space: nowrap; flex-shrink: 0; transition: background .15s;
}
.btn-finish:hover { background: #0f172a; }


.walkin-separator {
  padding: 6px 16px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
  color: var(--text-light); background: #fafafa;
  border-top: 1px dashed var(--border); border-bottom: 1px solid var(--border);
}

/* ── DURÉE PRESTATION ── */
.svc-duration {
  font-size: 11px; color: var(--text-light); font-weight: 500;
}

/* ── CHEVAUCHEMENT ── */
.overlap-badge {
  font-size: 10.5px; font-weight: 700;
  background: #fef3c7; color: #d97706;
  border: 1px solid #fcd34d; border-radius: 999px;
  padding: 2px 8px; flex-shrink: 0; white-space: nowrap;
}

.appt-row.overlapping {
  background: #fffbeb;
  border-left: 3px solid #f59e0b;
}

.btn-danger {
  background: #ef4444; color: #fff; border-color: #ef4444;
}
.btn-danger:hover { background: #dc2626; border-color: #dc2626; }


.btn-noshow {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; flex-shrink: 0;
  background: #ede9fe; border: 1px solid #c4b5fd;
  border-radius: 6px; color: #7c3aed; cursor: pointer; transition: all .15s;
}
.btn-noshow:hover { background: #ddd6fe; border-color: #a78bfa; }

.btn-delete-walkin {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; flex-shrink: 0;
  background: transparent; border: 1px solid var(--border);
  border-radius: 6px; color: var(--text-muted); cursor: pointer; transition: all .15s;
}
.btn-delete-walkin:hover { background: #fee2e2; border-color: #fca5a5; color: #dc2626; }

/* ── RDV NON AFFECTÉS ── */
.unassigned-section {
  background: #fff; border: 1.5px solid #fde68a; border-left: 4px solid #f59e0b;
  border-radius: 12px; overflow: hidden; margin-bottom: 20px;
}
.unassigned-header {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; background: #fffbeb; border-bottom: 1px solid #fde68a;
}
.unassigned-icon {
  width: 30px; height: 30px; background: #fef3c7; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; color: #d97706; flex-shrink: 0;
}
.unassigned-title { font-size: 13.5px; font-weight: 700; color: #92400e; }
.unassigned-sub   { font-size: 12px; color: #b45309; margin-left: auto; }
.unassigned-list  { display: flex; flex-direction: column; }
.unassigned-row {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 16px; border-bottom: 1px solid #fef3c7; transition: background .12s;
}
.unassigned-row:last-child { border-bottom: none; }
.unassigned-row:hover { background: #fffbeb; }
.ua-time    { font-size: 13px; font-weight: 800; color: #92400e; min-width: 48px; font-variant-numeric: tabular-nums; }
.ua-info    { flex: 1; min-width: 0; }
.ua-client  { font-size: 14px; font-weight: 700; color: var(--text-main); }
.ua-service { font-size: 12px; color: var(--text-muted); margin-top: 2px; display: flex; align-items: center; gap: 6px; }
.ua-heavy-badge { display: inline-flex; align-items: center; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; white-space: nowrap; }
.ua-assign  { display: flex; align-items: center; gap: 8px; min-width: 220px; }
.ua-saving  { display: flex; align-items: center; }

.mini-spinner {
  width: 16px; height: 16px;
  border: 2px solid var(--border); border-top-color: var(--primary);
  border-radius: 50%; animation: spin .6s linear infinite;
}

/* ── DIALOG ANNULATION ── */
.overlay {
  position: fixed; inset: 0; background: rgba(15,23,42,.45);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
}
.cancel-dialog {
  background: #fff; border-radius: 16px; padding: 28px;
  width: 380px; max-width: calc(100vw - 32px);
  box-shadow: 0 20px 60px rgba(0,0,0,.2);
  display: flex; flex-direction: column; gap: 12px;
}
.cancel-dialog-icon {
  width: 48px; height: 48px; border-radius: 12px;
  background: #fee2e2; color: #dc2626;
  display: flex; align-items: center; justify-content: center;
}
.cancel-dialog-title { font-size: 17px; font-weight: 800; color: var(--text-main); margin: 0; }
.cancel-dialog-sub   { font-size: 13px; color: var(--text-muted); margin: 0; }
.cancel-opt {
  display: flex; align-items: center; gap: 14px;
  padding: 14px; border-radius: 10px; border: 1.5px solid var(--border);
  background: #f8fafc; cursor: pointer; text-align: left;
  transition: all .12s; width: 100%;
}
.cancel-opt:hover         { border-color: var(--primary); background: #fff; }
.cancel-opt--delete:hover { border-color: #ef4444; }
.cancel-opt-icon  { font-size: 20px; flex-shrink: 0; width: 36px; text-align: center; }
.cancel-opt-label { font-size: 13.5px; font-weight: 700; color: var(--text-main); }
.cancel-opt-desc  { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; }
.cancel-opt--delete .cancel-opt-label { color: #dc2626; }

/* ── PANNEAU DEV ── */
.dev-date-panel {
  position: fixed; bottom: 16px; right: 16px;
  display: flex; align-items: center; gap: 8px;
  background: #1e293b; color: #f8fafc;
  padding: 8px 14px; border-radius: 10px;
  font-size: 12px; font-weight: 600;
  box-shadow: 0 4px 16px rgba(0,0,0,.3); z-index: 9999;
}
.dev-label { color: #94a3b8; white-space: nowrap; }
.dev-date-input {
  background: #334155; border: 1px solid #475569; color: #f8fafc;
  border-radius: 6px; padding: 3px 8px; font-size: 12px; cursor: pointer;
}
.dev-reset-btn {
  background: #ef4444; border: none; color: #fff;
  padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer;
}
.dev-reset-btn:hover { background: #dc2626; }

/* ── RESPONSIVE ── */
@media (max-width: 1024px) {
  .main-grid { grid-template-columns: 1fr; }
  .queue-panel { order: -1; }
}
@media (max-width: 640px) {
  .stats-bar { padding: 16px; }
  .stat-num  { font-size: 24px; }
  .appt-time { min-width: 64px; }
}
</style>
