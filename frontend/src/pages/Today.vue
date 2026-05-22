<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import ToastContainer from '../components/common/ToastContainer.vue'
import AddWalkinModal from '../components/today/AddWalkinModal.vue'
import ServeWalkinModal from '../components/today/ServeWalkinModal.vue'
import RecapRdvModal from '../components/today/RecapRdvModal.vue'
import ServeServiceModal from '../components/today/ServeServiceModal.vue'
import CaisseDrawer from '../components/today/CaisseDrawer.vue'
import EncaisserModal from '../components/today/EncaisserModal.vue'
import EditApptModal from '../components/today/EditApptModal.vue'
import AddServiceToApptModal from '../components/today/AddServiceToApptModal.vue'
import CustomSelect from '../components/common/CustomSelect.vue'
import DropdownActions from '../components/common/DropdownActions.vue'
import { completeAppointment } from '../services/today.service'
import { fetchStaff } from '../services/staff.service'
import { fetchServices } from '../services/services.service'
import { supabase } from '../lib/supabase'
import { useQueue } from '../composables/useQueue'
import { useUnassigned } from '../composables/useUnassigned'
import { useStaffColumns } from '../composables/useStaffColumns'
import { useToast } from '../composables/useToast'

// ── Date de test (dev uniquement) ──────────────────────────────────────────
const isDev = import.meta.env.DEV
const TEST_DATE_KEY = 'medsolutions_test_date'
const testDateOverride = ref(localStorage.getItem(TEST_DATE_KEY) || '')

function getToday() {
  return testDateOverride.value || new Date().toLocaleDateString('en-CA')
}

function getNowIso() {
  if (isDev && testDateOverride.value) {
    const now = new Date()
    const [y, mo, d] = testDateOverride.value.split('-').map(Number)
    return new Date(y, mo - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString()
  }
  return new Date().toISOString()
}

function setTestDate(d) {
  testDateOverride.value = d
  if (d) localStorage.setItem(TEST_DATE_KEY, d)
  else localStorage.removeItem(TEST_DATE_KEY)
  nowMs.value = getRealNowMs()
  fetchData()
}
// ────────────────────────────────────────────────────────────────────────────

// ── État global ──────────────────────────────────────────────────────────────
const staff        = ref([])
const services     = ref([])
const appointments = ref([])
const isLoading    = ref(true)
const showCompleted = ref(true)

// ── Modals ───────────────────────────────────────────────────────────────────
const showAddWalkin       = ref(false)
const showServeModal      = ref(false)
const selectedWalkin      = ref(null)
const showRecapModal      = ref(false)
const selectedRecapAppt   = ref(null)
const showServeServiceModal = ref(false)
const selectedServeService  = ref(null)
const showCaisseDrawer      = ref(false)
const showEncaisserModal    = ref(false)
const encaisserTarget       = ref(null)
const showRdvEditModal      = ref(false)
const rdvEditTarget         = ref(null)
const showAddServiceModal   = ref(false)
const addServiceTarget      = ref(null)

const router  = useRouter()
const normOne = v => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
const { toast } = useToast()

const SVG_FLAG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L12.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`

function openAddService(a) {
  const raw = appointments.value.find(apt => apt.id === a.id) || a.raw || a
  addServiceTarget.value = raw
  showAddServiceModal.value = true
}

function openEditModal(a) {
  const raw = appointments.value.find(apt => apt.id === a.id) || a.raw || a
  rdvEditTarget.value = raw
  showRdvEditModal.value = true
}

function openStaffRow(a) {
  const rawAppt = appointments.value.find(apt => apt.id === a.id) || a.raw
  selectedRecapAppt.value = {
    ...rawAppt,
    appointment_services: (rawAppt.appointment_services || []).map(as => ({
      ...as, service: normOne(as.service), staff: normOne(as.staff)
    }))
  }
  showRecapModal.value = true
}

async function onRecapFinish({ apptId, svcId }) {
  await finish(apptId, svcId)
  // Mettre à jour le modal avec les données fraîches — si tout est terminé, isPayable s'active
  const appt = appointments.value.find(a => a.id === apptId)
  if (!appt) { showRecapModal.value = false; return }
  const allDone = (appt.appointment_services || []).every(s => s.status === 'completed' || s.status === 'cancelled')
  selectedRecapAppt.value = {
    ...appt,
    appointment_services: (appt.appointment_services || []).map(as => ({
      ...as, service: normOne(as.service), staff: normOne(as.staff)
    }))
  }
  if (!allDone) showRecapModal.value = false
  // Si allDone : garder le modal ouvert → payment panel s'affiche automatiquement
}

function onRecapServe({ appointment, service }) {
  const rawAppt = appointments.value.find(a => a.id === appointment.id) || appointment
  selectedServeService.value = {
    appointment: {
      ...rawAppt,
      appointment_services: (rawAppt.appointment_services || []).map(as => ({
        ...as, service: normOne(as.service), staff: normOne(as.staff)
      }))
    },
    service
  }
  showServeServiceModal.value = true
}

function openServeUnassigned(a) {
  const rawAppt = appointments.value.find(apt => apt.id === a.id) || null
  const filteredSvcs = rawAppt
    ? (rawAppt.appointment_services?.filter(as => as.id === a.appointmentServiceId) || []).map(as => ({
        ...as, service: normOne(as.service), staff: normOne(as.staff)
      }))
    : []
  selectedWalkin.value = {
    id: a.id, client: a.client, time: a.time,
    raw: rawAppt ? { ...rawAppt, appointment_services: filteredSvcs } : null
  }
  showServeModal.value = true
}

// ── Confirmation générique ───────────────────────────────────────────────────
const confirmDialog = ref({ show: false, title: '', message: '', btnLabel: 'Confirmer', danger: false, onConfirm: null })

function showConfirm({ title, message, btnLabel = 'Confirmer', danger = false, onConfirm }) {
  confirmDialog.value = { show: true, title, message, btnLabel, danger, onConfirm }
}

function executeConfirm() {
  confirmDialog.value.onConfirm?.()
  confirmDialog.value.show = false
}

// ── Statut appointment ───────────────────────────────────────────────────────
function apptStatusFromSvcs(svcs) {
  if (!svcs.length) return 'in_progress'
  if (svcs.every(s => s.status === 'cancelled')) return 'cancelled'
  if (svcs.every(s => s.status === 'completed' || s.status === 'cancelled')) return 'completed'
  return 'in_progress'
}

async function handleCancelAction(action, directId, directSvcId, clientName = '') {
  try {
    if (directSvcId) {
      const { data: allSvcs } = await supabase.from('appointment_services').select('id, status').eq('appointment_id', directId)
      if (action === 'cancel') {
        await supabase.from('appointment_services').update({ status: 'cancelled' }).eq('id', directSvcId)
        const updated = (allSvcs || []).map(s => s.id === directSvcId ? { ...s, status: 'cancelled' } : s)
        const newStatus = apptStatusFromSvcs(updated)
        const apptUpdate = { status: newStatus }
        if (newStatus === 'cancelled' || newStatus === 'completed') apptUpdate.end_time = getNowIso()
        await supabase.from('appointments').update(apptUpdate).eq('id', directId)
      } else {
        await supabase.from('appointment_services').delete().eq('id', directSvcId)
        const remaining = (allSvcs || []).filter(s => s.id !== directSvcId)
        if (remaining.length === 0) {
          await supabase.from('appointments').delete().eq('id', directId)
        } else {
          await supabase.from('appointments').update({ status: apptStatusFromSvcs(remaining) }).eq('id', directId)
        }
      }
    } else {
      if (action === 'cancel') {
        await supabase.from('appointments').update({ status: 'cancelled', end_time: getNowIso() }).eq('id', directId)
      } else {
        await supabase.from('appointments').delete().eq('id', directId)
      }
    }
    await fetchData()
    const label = clientName ? ` — ${clientName}` : ''
    if (action === 'cancel') toast.success(`Prestation annulée${label}`)
    else toast.success(`Prestation supprimée${label}`)
  } catch(e) { console.error(e); toast.error('Erreur lors de l\'action') }
}

// ── Clients signalés ─────────────────────────────────────────────────────────
const flaggedClientIds = ref(new Set())

async function loadFlaggedClients() {
  const [{ data: badAppts }, { data: clients }] = await Promise.all([
    supabase.from('appointments').select('client_id').in('status', ['cancelled', 'noshow']),
    supabase.from('clients').select('id, flag_dismissed_count')
  ])
  if (!badAppts || !clients) return
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

// ── Fetch principal ──────────────────────────────────────────────────────────
let fetchEpoch = 0

const fetchData = async () => {
  const epoch = ++fetchEpoch
  try {
    isLoading.value = true
    const today = getToday()
    const SELECT_APPT = `*, payment_status, payment_method, client:client_id(id, name, last_name), appointment_services(id, status, staff_id, start_time, price_at_booking, is_parallel, service:service_id(id, name, duration_minutes, price), staff:staff_id(id, name))`
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
      const terminal  = ['completed', 'cancelled', 'noshow'].includes(a.status)
      if (startDate === today) { seen.add(a.id); result.push(a) }
      else if (startDate < today && !terminal) { seen.add(a.id); result.push(a) }
      else if (startDate < today && terminal && endDate === today) { seen.add(a.id); result.push(a) }
    }
    if (epoch !== fetchEpoch) return
    appointments.value = result
    await loadFlaggedClients()
  } catch (e) {
    console.error('Error loading dashboard:', e)
  } finally {
    isLoading.value = false
  }
}

// ── Horloge temps réel (indicateur retard) ──────────────────────────────────
function getRealNowMs() {
  if (isDev && testDateOverride.value) {
    const now = new Date()
    const [y, mo, d] = testDateOverride.value.split('-').map(Number)
    return new Date(y, mo - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).getTime()
  }
  return Date.now()
}
const nowMs = ref(getRealNowMs())
let clockTimer
let bauhausObs = null

// ── Effet Bauhaus : border glow suit la souris ───────────────────────────────
function attachBauhausEffect() {
  document.querySelectorAll('.appt-card[data-bauhaus]').forEach(card => {
    if (card._bauhaus) return
    card._bauhaus = true
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect()
      const angle = Math.atan2(-(e.clientX - r.left - r.width / 2), e.clientY - r.top - r.height / 2)
      card.style.setProperty('--r', angle + 'rad')
    })
    card.addEventListener('mouseleave', () => card.style.setProperty('--r', '4.2rad'))
  })
}

onMounted(() => {
  fetchData()
  clockTimer = setInterval(() => { nowMs.value = getRealNowMs() }, 30000)
  // Observer pour attacher l'effet Bauhaus aux nouvelles cartes
  const obs = new MutationObserver(() => attachBauhausEffect())
  const area = document.querySelector('.today-main-area')
  if (area) obs.observe(area, { childList: true, subtree: true })
  bauhausObs = obs
})
onUnmounted(() => {
  clearInterval(clockTimer)
  bauhausObs?.disconnect()
})

// ── Déplacements externes ────────────────────────────────────────────────────
const PERIOD_LABELS = { morning: 'Matin', afternoon: 'Après-midi', evening: 'Soir', allday: 'Journée' }
const PERIOD_FR     = { morning: 'le matin', afternoon: "l'après-midi", evening: 'le soir', allday: 'toute la journée' }

function isInExternalPeriodNow(period) {
  const min = new Date().getHours() * 60 + new Date().getMinutes()
  if (period === 'allday')    return true
  if (period === 'morning')   return min < 13 * 60
  if (period === 'afternoon') return min >= 13 * 60 && min < 18 * 60
  if (period === 'evening')   return min >= 18 * 60
  return false
}

function staffExternalConflict(staffId) {
  for (const a of appointments.value) {
    if (!a.is_external || ['cancelled', 'completed', 'noshow'].includes(a.status)) continue
    if (!a.appointment_services?.some(as => (as.staff?.id ?? as.staff_id) === staffId)) continue
    if (isInExternalPeriodNow(a.external_period)) return PERIOD_FR[a.external_period] || a.external_period
  }
  return null
}

const externalConflicts = computed(() => {
  const map = {}
  for (const sm of staff.value) {
    const conflict = staffExternalConflict(sm.id)
    if (conflict) map[sm.id] = conflict
  }
  return map
})

function staffExternalRdvs(sm) {
  const today = getToday()
  return appointments.value.filter(a =>
    a.is_external && a.status !== 'cancelled' &&
    a.appointment_services?.some(as => as.staff?.id === sm.id)
  ).map(a => {
    const date   = (a.start_time || '').slice(0, 10)
    const period = a.external_period ? PERIOD_LABELS[a.external_period] : null
    return { id: a.id, label: `RDV externe${period ? ' – ' + period : ''}`, isToday: date === today }
  })
}

function isAbsentToday(sm) {
  const today = getToday()
  return sm.absences?.some(a => a.start_date <= today && a.end_date >= today)
}

// ── Actions RDV (colonnes staff) ─────────────────────────────────────────────
async function noShow(apptId) {
  try {
    await supabase.from('appointment_services').update({ status: 'cancelled' }).eq('appointment_id', apptId)
    await supabase.from('appointments').update({ status: 'noshow', end_time: getNowIso() }).eq('id', apptId)
    await fetchData()
    toast.success('Client marqué absent (no-show)')
  } catch(e) { console.error(e); toast.error('Erreur lors du no-show') }
}

async function cancelAppt(apptId) {
  try {
    await supabase.from('appointment_services').update({ status: 'cancelled' }).eq('appointment_id', apptId)
    await supabase.from('appointments').update({ status: 'cancelled', end_time: getNowIso() }).eq('id', apptId)
    await fetchData()
    toast.success('Rendez-vous annulé')
  } catch(e) { console.error(e); toast.error('Erreur lors de l\'annulation') }
}

async function deleteAppt(apptId) {
  try {
    await supabase.from('appointment_services').delete().eq('appointment_id', apptId)
    await supabase.from('appointments').delete().eq('id', apptId)
    await fetchData()
    toast.success('Rendez-vous supprimé')
  } catch(e) { console.error(e); toast.error('Erreur lors de la suppression') }
}

async function deleteWalkinSvc(w) {
  try {
    if (w.svcId) {
      const { data: allSvcs } = await supabase.from('appointment_services').select('id').eq('appointment_id', w.id)
      await supabase.from('appointment_services').delete().eq('id', w.svcId)
      if ((allSvcs || []).length <= 1) await supabase.from('appointments').delete().eq('id', w.id)
    } else {
      await supabase.from('appointment_services').delete().eq('appointment_id', w.id)
      await supabase.from('appointments').delete().eq('id', w.id)
    }
    await fetchData()
    toast.success('Prestation supprimée')
  } catch(e) { console.error(e); toast.error('Erreur lors de la suppression') }
}

// ── Cascade start_time ───────────────────────────────────────────────────────
async function shiftCascadeFrom(apptId, fromSvcId, endTimeIso) {
  const normOne = v => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
  const { data: svcs } = await supabase
    .from('appointment_services')
    .select('id, start_time, status, is_parallel, service:service_id(duration_minutes)')
    .eq('appointment_id', apptId)
    .order('start_time', { ascending: true })
  if (!svcs?.length) return
  const all = svcs.map(s => ({ ...s, service: normOne(s.service) }))
  const fromSvc = all.find(s => s.id === fromSvcId)
  if (!fromSvc) return
  // Services non-terminaux, non-parallèles, qui commencent à la même heure ou après
  const downstream = all.filter(s =>
    s.id !== fromSvcId &&
    !s.is_parallel &&
    !['completed', 'cancelled'].includes(s.status) &&
    s.start_time >= fromSvc.start_time
  )
  if (!downstream.length) return
  let nextStart = new Date(endTimeIso)
  for (const svc of downstream) {
    const planned = new Date(svc.start_time)
    if (nextStart <= planned) break
    await supabase.from('appointment_services').update({ start_time: nextStart.toISOString() }).eq('id', svc.id)
    const dur = svc.service?.duration_minutes || 30
    nextStart = new Date(nextStart.getTime() + dur * 60000)
  }
}

// ── Décalage manuel ──────────────────────────────────────────────────────────
const editingTimeId = ref(null)

async function manualShift(apptId, svcId, newTimeStr, duration) {
  editingTimeId.value = null
  try {
    const [h, m] = newTimeStr.split(':').map(Number)
    const [y, mo, d] = getToday().split('-').map(Number)
    const localStart = new Date(y, mo - 1, d, h, m, 0)
    const newStartIso = localStart.toISOString()
    await supabase.from('appointment_services').update({ start_time: newStartIso }).eq('id', svcId)
    const localEnd = new Date(localStart.getTime() + (duration || 30) * 60000)
    await shiftCascadeFrom(apptId, svcId, localEnd.toISOString())
    await fetchData()
  } catch(e) { console.error(e) }
}

const SVG_NOSHOW = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M8 15s1.5-2 4-2 4 2 4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`
const SVG_CANCEL = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
const SVG_DELETE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`

function apptActions(a) {
  return [
    { label: 'No show', icon: SVG_NOSHOW, onClick: () => showConfirm({ title: 'No show', message: `Confirmer l'absence de ${a.client} ?`, btnLabel: 'Confirmer', danger: false, onConfirm: () => noShow(a.id) }) },
    { label: 'Annuler', icon: SVG_CANCEL, class: 'danger', onClick: () => showConfirm({ title: 'Annuler le RDV', message: `Annuler le RDV de ${a.client} ?`, btnLabel: 'Annuler le RDV', danger: true, onConfirm: () => cancelAppt(a.id) }) },
    { label: 'Supprimer', icon: SVG_DELETE, class: 'danger', onClick: () => showConfirm({ title: 'Supprimer', message: `Supprimer définitivement le RDV de ${a.client} ?`, btnLabel: 'Supprimer', danger: true, onConfirm: () => deleteAppt(a.id) }) },
  ]
}

async function checkIn(apptId) {
  try {
    await supabase.from('appointments').update({ status: 'in_progress' }).eq('id', apptId)
    await fetchData()
    toast.success('Client arrivé ✓')
  } catch(e) { console.error(e); toast.error('Erreur lors du check-in') }
}

async function finish(apptId, svcId) {
  try {
    const nowIso = getNowIso()
    if (svcId) {
      await supabase.from('appointment_services').update({ status: 'completed' }).eq('id', svcId)
      await shiftCascadeFrom(apptId, svcId, nowIso)
      const { data: allSvcs } = await supabase.from('appointment_services').select('id, status').eq('appointment_id', apptId)
      const updated = (allSvcs || []).map(s => s.id === svcId ? { ...s, status: 'completed' } : s)
      const stillActive = updated.filter(s => s.status !== 'completed' && s.status !== 'cancelled')
      if (stillActive.length === 0) await completeAppointment(apptId, nowIso)
    } else {
      await completeAppointment(apptId, nowIso)
    }
    await fetchData()
    toast.success('Prestation terminée ✓')
  } catch(e) { console.error(e); toast.error('Erreur lors de la finalisation') }
}

// ── Confirmation "Terminer" → split Encaisser / Plus tard ───────────────────
const pendingFinish    = ref(null) // clé unique : svcId ou apptId
let   pendingFinishTimer = null

function askFinish(apptId, svcId) {
  const key = svcId || apptId
  if (pendingFinish.value === key) return // déjà ouvert, les boutons gèrent l'action
  clearTimeout(pendingFinishTimer)
  pendingFinish.value = key
  pendingFinishTimer = setTimeout(() => { pendingFinish.value = null }, 5000)
}

function cancelPendingFinish() {
  clearTimeout(pendingFinishTimer)
  pendingFinish.value = null
}

async function finishLater(apptId, svcId) {
  cancelPendingFinish()
  await finish(apptId, svcId)
}

function openEncaisserById(apptId) {
  const appt = appointments.value.find(a => a.id === apptId)
  if (!appt) return
  encaisserTarget.value = { id: apptId, raw: appt }
  showEncaisserModal.value = true
}

function openEncaisserFromAppt(appt) {
  encaisserTarget.value = { id: appt.id, raw: appt }
  showRecapModal.value  = false
  showRdvEditModal.value = false
  showCaisseDrawer.value = false
  showEncaisserModal.value = true
}

async function finishAndEncaisser(apptId, svcId, row) {
  cancelPendingFinish()
  await finish(apptId, svcId)
  // Ouvrir le modal d'encaissement avec les données fraîches
  encaisserTarget.value = { ...row, id: apptId }
  showEncaisserModal.value = true
}

// ── Barre "Maintenant" ───────────────────────────────────────────────────────
const nowTimeStr = computed(() => {
  const d = new Date(nowMs.value)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
})

const TERMINAL_STATUSES = ['past', 'cancelled', 'noshow']

function nowBarBeforeIdx(rows) {
  for (let i = 0; i < rows.length; i++) {
    if (TERMINAL_STATUSES.includes(rows[i].status)) return i
  }
  return -1
}

// ── Collapse section "sans collaborateur" ────────────────────────────────────
const UNASSIGNED_COLLAPSED_KEY = 'glambook_unassigned_collapsed'
const unassignedCollapsed = ref(localStorage.getItem(UNASSIGNED_COLLAPSED_KEY) === '1')

function toggleUnassigned() {
  unassignedCollapsed.value = !unassignedCollapsed.value
  localStorage.setItem(UNASSIGNED_COLLAPSED_KEY, unassignedCollapsed.value ? '1' : '0')
}

// ── Collapse colonne staff ───────────────────────────────────────────────────
const collapsed = ref({})
function toggleCollapse(id) { collapsed.value[id] = !collapsed.value[id] }
function collapseAll()      { staff.value.forEach(sm => { collapsed.value[sm.id] = true  }) }
function expandAll()        { staff.value.forEach(sm => { collapsed.value[sm.id] = false }) }

const selectedStaffModal = ref(null)

// ── Mode d'affichage (staff | chrono) ───────────────────────────────────────
const VIEW_MODE_KEY = 'glambook_today_view'
const viewMode = ref(localStorage.getItem(VIEW_MODE_KEY) || 'staff')
function setViewMode(v) { viewMode.value = v; localStorage.setItem(VIEW_MODE_KEY, v) }

// ── Composables ──────────────────────────────────────────────────────────────
const { walkinRows, openQueueRow, confirmDeleteQueueRow } = useQueue({
  appointments, flaggedClientIds, fetchData, showConfirm, selectedWalkin, showServeModal
})

const { unassigned, staffForUnassigned, assignStaffWithCheck, confirmHeavyAssign, heavyAssignWarning, pendingHeavyAssign, pendingStaff, assigningId } = useUnassigned({
  appointments, services, staff, fetchData, staffExternalConflict
})

const { staffAppts, staffWalkins, overlappingSvcIds, staffHasOverlap, staffColor, staffWithColor } = useStaffColumns({
  appointments, staff, flaggedClientIds, showCompleted, getToday, nowMs
})

// ── Stats ────────────────────────────────────────────────────────────────────
const todayLabel = computed(() =>
  new Date(getToday() + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
)

const stats = computed(() => ({
  waiting:    walkinRows.value.length,
  inProgress: appointments.value.filter(a =>
    a.status === 'in_progress' &&
    (a.appointment_services || []).some(as => as.staff?.id || as.staff_id)
  ).length,
  completed:  appointments.value.filter(a => a.status === 'completed').length,
  total:      appointments.value.filter(a => a.type !== 'walkin').length
}))

const caJour = computed(() => {
  let total = 0
  for (const a of appointments.value) {
    for (const as of (a.appointment_services || [])) {
      if (as.status === 'completed' && as.price_at_booking != null) {
        total += Number(as.price_at_booking)
      }
    }
  }
  return total
})

// ── Vue Réception — statut temps réel par staff ──────────────────────────────
const staffReceptionStatus = computed(() => {
  const now = new Date(nowMs.value)
  return staffWithColor.value.map(sm => {
    let currentSvc = null
    let minsLeft   = null
    for (const a of appointments.value) {
      if (a.status !== 'in_progress') continue
      for (const as of (a.appointment_services || [])) {
        const sid = Array.isArray(as.staff) ? as.staff[0]?.id : (as.staff?.id ?? as.staff_id)
        if (sid !== sm.id) continue
        if (['completed', 'cancelled'].includes(as.status)) continue
        const svc = Array.isArray(as.service) ? as.service[0] : as.service
        const dur  = svc?.duration_minutes || 30
        const start = as.start_time ? new Date(as.start_time) : null
        if (start) {
          currentSvc = svc?.name || 'Prestation'
          minsLeft   = Math.ceil((start.getTime() + dur * 60000 - now.getTime()) / 60000)
        }
        break
      }
      if (currentSvc) break
    }
    const color = staffColor(sm)
    const hasExternalAppt = appointments.value.some(a =>
      a.is_external && a.status === 'in_progress' &&
      (a.appointment_services || []).some(as => {
        const sid = Array.isArray(as.staff) ? as.staff[0]?.id : (as.staff?.id ?? as.staff_id)
        return sid === sm.id
      })
    )
    return { ...sm, currentSvc, minsLeft, isAbsent: isAbsentToday(sm), color, hasExternalAppt }
  }).sort((a, b) => {
    const aActive = a.color !== 'free' && !a.isAbsent
    const bActive = b.color !== 'free' && !b.isAbsent
    if (aActive && !bActive) return -1
    if (!aActive && bActive) return 1
    return 0
  })
})

function waitMins(timeStr) {
  if (!timeStr) return null
  const parts = (timeStr + ':00').split(':').map(Number)
  const today  = getToday()
  const [y, mo, d] = today.split('-').map(Number)
  const arrival = new Date(y, mo - 1, d, parts[0], parts[1], 0)
  return Math.max(0, Math.floor((new Date(nowMs.value) - arrival) / 60000))
}

// ── Vue Chrono — liste plate triée par heure ─────────────────────────────────
const chronoRows = computed(() => {
  const rows = []
  for (const sm of staffWithColor.value) {
    for (const a of staffAppts(sm)) {
      rows.push({ ...a, staffName: sm.name, _staffId: sm.id })
    }
    for (const w of staffWalkins(sm)) {
      rows.push({ ...w, staffName: sm.name, _staffId: sm.id, _isWalkin: true })
    }
  }
  const priority = s => s === 'current' ? 0 : s === 'upcoming' ? 1 : 2
  rows.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
    const pd = priority(a.status) - priority(b.status)
    if (pd !== 0) return pd
    return (a.time || '').slice(0, 5).localeCompare((b.time || '').slice(0, 5))
  })
  if (!showCompleted.value) {
    return rows.filter(r => !['past', 'cancelled', 'noshow'].includes(r.status))
  }
  return rows
})

// ── Helpers visuels statut ───────────────────────────────────────────────────
function statusLabel(status) {
  if (status === 'in_progress') return 'En cours'
  if (status === 'upcoming')    return 'Planifié'
  if (status === 'past')        return 'Terminé'
  if (status === 'cancelled')   return 'Annulé'
  if (status === 'noshow')      return 'No show'
  return 'Planifié'
}
function statusAccentVar(status) {
  if (status === 'in_progress') return 'var(--td-green)'
  if (status === 'upcoming')    return 'var(--td-blue)'
  if (status === 'past')        return 'rgba(34,197,94,.4)'
  return 'rgba(255,255,255,.12)'
}
function statusBadgeClass(status) {
  if (status === 'in_progress') return 'k-badge-green'
  if (status === 'upcoming')    return 'k-badge-blue'
  if (status === 'past')        return 'k-badge-done'
  return 'k-badge-muted'
}
function statusTagClass(status) {
  if (status === 'in_progress') return 'cc-tag-green'
  if (status === 'upcoming')    return 'cc-tag-blue'
  return 'cc-tag-muted'
}

// ── Onglets ──────────────────────────────────────────────────────────────────
const TODAY_TAB_KEY = 'glambook_today_tab'
const activeTab = ref(localStorage.getItem(TODAY_TAB_KEY) || 'queue')
function setTab(t) { activeTab.value = t; localStorage.setItem(TODAY_TAB_KEY, t) }

function staffProgressPct(smId) {
  const rs = staffReceptionStatus.value.find(s => s.id === smId)
  if (!rs) return 0
  if (rs.minsLeft != null && rs.minsLeft <= 0) return 100
  if (!rs.minsLeft) return 0
  for (const a of appointments.value) {
    if (a.status !== 'in_progress') continue
    for (const as of (a.appointment_services || [])) {
      const sid = Array.isArray(as.staff) ? as.staff[0]?.id : (as.staff?.id ?? as.staff_id)
      if (sid !== smId) continue
      if (['completed', 'cancelled'].includes(as.status)) continue
      const svc = Array.isArray(as.service) ? as.service[0] : as.service
      const dur = svc?.duration_minutes || 30
      return Math.max(0, Math.min(100, Math.round((1 - rs.minsLeft / dur) * 100)))
    }
  }
  return 50
}
</script>

<template>
  <div class="today-layout">

    <!-- ── TOPBAR ── -->
    <div class="today-topbar">
      <div class="tb-left">
        <div class="tb-title">
          <div class="tb-dot"></div>
          Aujourd'hui
        </div>
        <div class="tb-date">{{ todayLabel }} <span class="tb-time">· {{ nowTimeStr }}</span></div>
      </div>

      <div class="tb-stats">
        <div class="stat-chip c-orange"><span class="sc-num">{{ stats.waiting }}</span> En attente</div>
        <div class="stat-chip c-blue"><span class="sc-num">{{ stats.inProgress }}</span> En cours</div>
        <div class="stat-chip c-green"><span class="sc-num">{{ stats.completed }}</span> Terminés</div>
        <div class="stat-chip c-muted"><span class="sc-num">{{ stats.total }}</span> RDV</div>
        <div class="stat-chip c-gold"><span class="sc-num">{{ caJour.toLocaleString('fr-FR') }}</span> MAD</div>
      </div>

      <div class="tb-right">
        <button class="tb-btn-outline" @click="router.push('/admin/rdv')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          Agenda
        </button>
        <button class="tb-btn-outline tb-btn-caisse" @click="showCaisseDrawer = true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
          </svg>
          Caisse
        </button>
        <button class="tb-btn-primary" @click="showAddWalkin = true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Sans RDV
        </button>
      </div>
    </div>

    <!-- ── STAFF STRIP ── -->
    <div class="staff-strip">
      <div
        v-for="sm in staffReceptionStatus" :key="sm.id"
        class="sc-chip" :class="{ 'sc-chip--absent': sm.isAbsent, 'sc-chip--external': sm.hasExternalAppt }"
        @click="selectedStaffModal = sm"
      >
        <div class="sc-av" :class="`sc-av-${sm.id % 4}`">{{ sm.name.charAt(0).toUpperCase() }}</div>
        <div class="sc-info">
          <div class="sc-name">{{ sm.name.split(' ')[0] }}</div>
          <div class="sc-status" :class="sm.isAbsent ? 'st-absent' : `st-${sm.color}`">
            {{ sm.isAbsent ? 'Congé' : sm.color === 'free' ? 'Libre' : sm.currentSvc ? sm.currentSvc.slice(0, 14) + (sm.currentSvc.length > 14 ? '…' : '') : 'En cours' }}
          </div>
          <div class="sc-mins" :style="(!sm.isAbsent && sm.color !== 'free' && sm.minsLeft != null) ? '' : 'visibility:hidden'">
            {{ (!sm.isAbsent && sm.color !== 'free' && sm.minsLeft != null) ? (sm.minsLeft > 0 ? sm.minsLeft + ' min' : 'Bientôt libre') : '—' }}
          </div>
          <div v-if="!sm.isAbsent" class="sc-progress">
            <div class="sc-progress-fill" :style="sm.color !== 'free' ? `width:${staffProgressPct(sm.id)}%` : 'width:0%'"></div>
          </div>
          <div v-else class="sc-progress"></div>
        </div>
        <div class="sc-dot" :class="sm.isAbsent ? 'dot-absent' : `dot-${sm.color}`"></div>
      </div>
    </div>

    <!-- ── TABS BAR ── -->
    <div class="tabs-bar">
      <button class="tab-btn" :class="{ active: activeTab === 'queue' }" @click="setTab('queue')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
          <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        File d'attente
        <span class="tab-badge" :class="{ 'tbadge-gold': (walkinRows.length + unassigned.length) > 0 }">
          {{ walkinRows.length + unassigned.length }}
        </span>
      </button>
      <button class="tab-btn" :class="{ active: activeTab === 'planning' }" @click="setTab('planning')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        Planning du jour
        <span class="tab-badge">{{ stats.total }}</span>
      </button>
      <button class="tab-btn" :class="{ active: activeTab === 'staff' }" @click="setTab('staff')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        Staff
        <span class="tab-badge">{{ staffWithColor.length }}</span>
      </button>
    </div>

    <!-- ── TAB CONTENT ── -->
    <div class="tab-content">

      <!-- ═══ TAB 1 : File d'attente + Non affectés ═══ -->
      <div v-show="activeTab === 'queue'" class="tab-panel">

        <div v-if="isLoading" class="t-loading"><div class="t-spinner"></div></div>

        <div v-else-if="!walkinRows.length && !unassigned.length" class="t-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>File vide — aucun client en attente</span>
        </div>

        <template v-else>

          <!-- Sans RDV (walkins) -->
          <template v-if="walkinRows.length">
            <div class="q-section-title">
              Sans RDV
              <span class="q-sec-badge">{{ walkinRows.length }}</span>
            </div>
            <div
              v-for="(row, idx) in walkinRows" :key="row.svcId ?? ('ph-' + row.id)"
              class="q-row" @click="openQueueRow(row)"
            >
              <div class="q-rank">{{ idx + 1 }}</div>
              <div class="q-av" :class="`sc-av-${(idx) % 4}`">{{ row.client.charAt(0).toUpperCase() }}</div>
              <div class="q-info">
                <div class="q-client">
                  {{ row.client }}
                  <span v-if="row.isFlagged" class="flag-inline" v-html="SVG_FLAG"></span>
                </div>
                <div class="q-svc">{{ row.serviceName }}<span v-if="row.duration"> · {{ row.duration }}min</span></div>
              </div>
              <div class="q-meta">
                <div class="q-arrival">{{ row.startTime }}</div>
                <div class="q-wait" :class="{ 'q-wait--long': waitMins(row.startTime) >= 20, 'q-wait--urgent': waitMins(row.startTime) >= 40 }">
                  <template v-if="waitMins(row.startTime) > 0">{{ waitMins(row.startTime) }} min</template>
                  <template v-else>À l'instant</template>
                </div>
              </div>
              <button class="q-serve-btn" @click.stop="openQueueRow(row)">Servir →</button>
              <button class="q-del-btn" title="Supprimer" @click.stop="confirmDeleteQueueRow(row)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            </div>
          </template>

          <!-- RDV sans collaborateur -->
          <template v-if="unassigned.length">
            <div class="q-section-title q-section-title--warn">
              RDV sans collaborateur
              <span class="q-sec-badge q-sec-badge--warn">{{ unassigned.length }}</span>
            </div>
            <div
              v-for="a in unassigned" :key="'ua-' + (a.svcId || a.id)"
              class="q-row q-row--unassigned" @click="openServeUnassigned(a)"
            >
              <div class="q-rank q-rank--warn">!</div>
              <div class="q-av sc-av-3">{{ a.client.charAt(0).toUpperCase() }}</div>
              <div class="q-info">
                <div class="q-client">
                  {{ a.client }}
                  <span v-if="a.isFlagged" class="flag-inline" v-html="SVG_FLAG"></span>
                </div>
                <div class="q-svc">{{ a.service }}</div>
              </div>
              <div class="q-meta">
                <div class="q-arrival">{{ a.time }}</div>
              </div>
              <div style="display:flex;gap:5px;flex-shrink:0" @click.stop>
                <button class="q-assign-btn" @click="openServeUnassigned(a)">Assigner →</button>
                <DropdownActions :actions="[
                  { label: 'No show', icon: SVG_NOSHOW, onClick: () => showConfirm({ title: 'No show', message: `Confirmer l\'absence de ${a.client} ?`, btnLabel: 'Confirmer', danger: false, onConfirm: () => noShow(a.id) }) },
                  { label: 'Annuler', icon: SVG_CANCEL, class: 'danger', onClick: () => showConfirm({ title: 'Annuler la prestation', message: `Annuler «${a.service}» pour ${a.client} ?`, btnLabel: 'Annuler', danger: true, onConfirm: () => handleCancelAction('cancel', a.id, a.svcId) }) },
                  { label: 'Supprimer', icon: SVG_DELETE, class: 'danger', onClick: () => showConfirm({ title: 'Supprimer', message: `Supprimer «${a.service}» pour ${a.client} ?`, btnLabel: 'Supprimer', danger: true, onConfirm: () => handleCancelAction('delete', a.id, a.svcId) }) }
                ]" />
              </div>
            </div>
          </template>

        </template>
      </div>

      <!-- ═══ TAB 2 : Planning du jour ═══ -->
      <div v-show="activeTab === 'planning'" class="tab-panel">

        <div class="plan-toolbar">
          <button class="plan-toggle-btn" @click="showCompleted = !showCompleted">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline v-if="showCompleted" points="20 6 9 17 4 12"/>
              <path v-else d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/>
            </svg>
            {{ showCompleted ? 'Masquer terminés' : 'Afficher terminés' }}
          </button>
        </div>

        <div v-if="isLoading" class="t-loading"><div class="t-spinner"></div></div>

        <div v-else-if="!chronoRows.length" class="t-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>Aucun rendez-vous pour aujourd'hui</span>
        </div>

        <div v-else class="plan-list">
          <div
            v-for="a in chronoRows" :key="(a.svcId || a.id) + '-plan'"
            class="plan-row"
            :class="[a.status, { 'plan-row--walkin': a._isWalkin, 'plan-row--done': ['past','cancelled','noshow'].includes(a.status) && !a.paymentPending }]"
            @click="a.paymentPending ? (encaisserTarget = a, showEncaisserModal = true) : openStaffRow(a)"
          >
            <!-- Temps -->
            <div class="p-time-col">
              <div class="p-time">{{ (a.time || '').split('–')[0].trim() }}</div>
              <span v-if="a.isOverdue" class="p-overdue-date">{{ a.apptDate?.slice(5).replace('-', '/') }}</span>
              <span v-else-if="a._isWalkin" class="p-walkin-badge">Sans RDV</span>
            </div>
            <!-- Client + prestation -->
            <div class="p-body">
              <div class="p-client">
                {{ a.client }}
                <span v-if="a.isFlagged" class="flag-inline" v-html="SVG_FLAG"></span>
              </div>
              <div class="p-svc">{{ a.service }}<span v-if="a.duration"> · {{ a.duration }}min</span></div>
            </div>
            <!-- Staff -->
            <div class="p-staff">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
                <circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              </svg>
              {{ a.staffName || '—' }}
            </div>
            <!-- Statut badge -->
            <div class="p-badge-col">
              <span v-if="a.status === 'current'" class="p-badge p-badge--green">En cours</span>
              <span v-else-if="a.status === 'upcoming'" class="p-badge p-badge--blue">Planifié</span>
              <span v-else-if="a.status === 'past' && a.paymentPending" class="p-badge p-badge--cash">💰 À encaisser</span>
              <span v-else-if="a.status === 'past'" class="p-badge p-badge--done">Terminé</span>
              <span v-else-if="a.status === 'cancelled'" class="p-badge p-badge--muted">Annulé</span>
              <span v-else-if="a.status === 'noshow'" class="p-badge p-badge--red">No-show</span>
            </div>
            <!-- Actions -->
            <div class="p-actions" @click.stop>
              <template v-if="a.status === 'upcoming'">
                <template v-if="a.isExternal">
                  <button class="p-btn" :class="pendingFinish === (a.svcId || a.id) ? 'p-btn--confirm' : 'p-btn--gold'" @click.stop="askFinish(a.id, a.svcId)">
                    <span v-if="pendingFinish === (a.svcId || a.id)">Confirmer ?</span>
                    <span v-else>Terminer</span>
                  </button>
                </template>
                <template v-else>
                  <button class="p-btn p-btn--green" @click.stop="checkIn(a.id)">Arrivée ✓</button>
                  <button class="p-btn p-btn--ghost" @click.stop="showConfirm({ title: 'No show', message: `Confirmer l\'absence de ${a.client} ?`, btnLabel: 'Confirmer', danger: false, onConfirm: () => noShow(a.id) })">No-show</button>
                  <button class="p-btn p-btn--cancel" @click.stop="showConfirm({ title: 'Annuler le RDV', message: `Annuler le RDV de ${a.client} ?`, btnLabel: 'Annuler le RDV', danger: true, onConfirm: () => cancelAppt(a.id) })">Annuler</button>
                </template>
              </template>
              <template v-else-if="a.status === 'current'">
                <template v-if="pendingFinish === (a.svcId || a.id)">
                  <button class="p-btn p-btn--enc-split" @click.stop="finishAndEncaisser(a.id, a.svcId, a)">💰 Encaisser</button>
                  <button class="p-btn p-btn--later" @click.stop="finishLater(a.id, a.svcId)">Plus tard</button>
                </template>
                <button v-else class="p-btn p-btn--gold" @click.stop="askFinish(a.id, a.svcId)">Terminer</button>
              </template>
            </div>
            <!-- + Modifier + Encaisser + Supprimer -->
            <div class="p-end-actions" @click.stop>
              <button class="p-btn-add" @click.stop="openAddService(a)" title="Ajouter une prestation">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              <button class="p-btn-edit" @click.stop="openEditModal(a)" title="Modifier">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button
                v-if="a.paymentPending"
                class="p-btn-enc"
                @click.stop="encaisserTarget = a; showEncaisserModal = true"
                title="Encaisser"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                  <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
                </svg>
              </button>
              <button class="p-btn-del" @click.stop="showConfirm({ title: 'Supprimer', message: `Supprimer définitivement le RDV de ${a.client} ?`, btnLabel: 'Supprimer', danger: true, onConfirm: () => deleteAppt(a.id) })" title="Supprimer">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ TAB 3 : Staff accordéon ═══ -->
      <div v-show="activeTab === 'staff'" class="tab-panel">

        <div v-if="isLoading" class="t-loading"><div class="t-spinner"></div></div>

        <div v-else-if="!staffReceptionStatus.length" class="t-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          <span>Aucun collaborateur actif</span>
        </div>

        <div v-else>
          <div class="plan-toolbar" style="margin-bottom:10px">
            <button class="plan-toggle-btn" @click="showCompleted = !showCompleted">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline v-if="showCompleted" points="20 6 9 17 4 12"/>
                <path v-else d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/>
              </svg>
              {{ showCompleted ? 'Masquer terminés' : 'Afficher terminés' }}
            </button>
            <button class="plan-toggle-btn" @click="Object.values(collapsed).some(v => v) ? expandAll() : collapseAll()">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/>
              </svg>
              {{ Object.values(collapsed).some(v => v) ? 'Tout déplier' : 'Tout replier' }}
            </button>
          </div>
          <div class="sa-list">
          <div
            v-for="sm in staffReceptionStatus" :key="sm.id"
            class="sa-accordion"
            :class="{ 'sa-open': !collapsed[sm.id], 'sa-absent': sm.isAbsent }"
          >
            <!-- Header -->
            <div class="sa-header" @click="toggleCollapse(sm.id)">
              <div class="sa-av" :class="`sc-av-${sm.id % 4}`">{{ sm.name.charAt(0).toUpperCase() }}</div>
              <div class="sa-info">
                <div class="sa-name">{{ sm.name }}</div>
                <div class="sa-sub" :class="sm.isAbsent ? 'st-absent' : `st-${sm.color}`">
                  {{ sm.isAbsent ? 'En congé aujourd\'hui'
                    : sm.color === 'free' ? 'Libre' + (staffAppts(sm).filter(a => a.status === 'upcoming').length ? ' — prochain RDV à venir' : '')
                    : sm.currentSvc ? 'En cours · ' + sm.currentSvc + (sm.minsLeft != null ? ' · ' + (sm.minsLeft > 0 ? sm.minsLeft + ' min restants' : 'bientôt libre') : '')
                    : 'En cours' }}
                </div>
              </div>
              <div class="sa-dot" :class="sm.isAbsent ? 'dot-absent' : `dot-${sm.color}`"></div>
              <span class="sa-count">{{ staffAppts(sm).length + staffWalkins(sm).length }} RDV</span>
              <svg class="sa-chevron" :class="{ 'sa-chevron--open': !collapsed[sm.id] }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>

            <!-- Body -->
            <div v-show="!collapsed[sm.id]" class="sa-body">

              <!-- Absent banner -->
              <div v-if="sm.isAbsent" class="sa-absent-banner">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                En congé
              </div>

              <!-- Overlap warning -->
              <div v-if="!sm.isAbsent && staffHasOverlap(sm)" class="sa-overlap">⚠ Chevauchement détecté</div>

              <!-- External RDV banners -->
              <div v-for="ext in staffExternalRdvs(sm)" :key="'ext-' + ext.id" class="sa-ext-banner">
                {{ ext.label }}
              </div>

              <!-- Empty -->
              <div v-if="!staffAppts(sm).length && !staffWalkins(sm).length && !sm.isAbsent" class="sa-empty">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="20 6 9 17 4 12"/></svg>
                Aucun RDV
              </div>

              <!-- Rows mélangés (RDV + walkins) triés par heure -->
              <div
                v-for="a in [...staffAppts(sm), ...staffWalkins(sm)].slice().sort((x,y) => ((x.time||'').split('–')[0].trim() < (y.time||'').split('–')[0].trim() ? -1 : 1))"
                :key="(a.svcId || a.id) + (a._isWalkin ? '-w' : '')"
                class="sa-appt-row"
                :class="{ 'sa-appt-row--current': a.status === 'in_progress', 'sa-appt-row--walkin': a._isWalkin }"
                @click="openStaffRow(a)"
              >
                <div class="sa-a-time">{{ (a.time || '—').split('–')[0].trim() }}</div>
                <div class="sa-a-client">
                  <div class="sa-a-name">{{ a.client }}<span v-if="a.isFlagged" class="flag-inline" v-html="SVG_FLAG"></span></div>
                  <div class="sa-a-svc">{{ a.service }}</div>
                </div>
                <div v-if="a.duration" class="sa-a-dur">{{ a.duration }}min</div>
                <!-- Badge statut -->
                <span v-if="a._isWalkin && a.status !== 'past'" class="sa-badge sa-badge--gold">Sans RDV</span>
                <span v-else-if="a.status === 'current'" class="sa-badge sa-badge--green">En cours</span>
                <span v-else-if="a.status === 'upcoming'" class="sa-badge sa-badge--blue">Planifié</span>
                <span v-else-if="a.status === 'past' && a.paymentPending" class="sa-badge sa-badge--cash">💰 À encaisser</span>
                <span v-else-if="a.status === 'past'" class="sa-badge sa-badge--done">Terminé</span>
                <span v-else-if="a.status === 'cancelled'" class="sa-badge sa-badge--muted">Annulé</span>
                <span v-else-if="a.status === 'noshow'" class="sa-badge sa-badge--red">No-show</span>
                <!-- Boutons d'action -->
                <div v-if="!a._isWalkin" class="sa-actions" @click.stop>
                  <template v-if="a.status === 'upcoming'">
                    <button class="sa-btn sa-btn--green" @click.stop="checkIn(a.id)">Arrivée ✓</button>
                    <button class="sa-btn sa-btn--ghost" @click.stop="showConfirm({ title: 'No show', message: `Confirmer l\'absence de ${a.client} ?`, btnLabel: 'Confirmer', danger: false, onConfirm: () => noShow(a.id) })">No-show</button>
                    <button class="sa-btn sa-btn--cancel" @click.stop="showConfirm({ title: 'Annuler le RDV', message: `Annuler le RDV de ${a.client} ?`, btnLabel: 'Annuler le RDV', danger: true, onConfirm: () => cancelAppt(a.id) })">Annuler</button>
                  </template>
                  <template v-else-if="a.status === 'current'">
                    <template v-if="pendingFinish === (a.svcId || a.id)">
                      <button class="sa-btn sa-btn--enc-split" @click.stop="finishAndEncaisser(a.id, a.svcId, a)">💰 Encaisser</button>
                      <button class="sa-btn sa-btn--later" @click.stop="finishLater(a.id, a.svcId)">Plus tard</button>
                    </template>
                    <template v-else>
                      <button class="sa-btn sa-btn--gold" @click.stop="askFinish(a.id, a.svcId)">Terminer</button>
                      <button class="sa-btn sa-btn--cancel" @click.stop="showConfirm({ title: 'Annuler le RDV', message: `Annuler le RDV de ${a.client} ?`, btnLabel: 'Annuler le RDV', danger: true, onConfirm: () => cancelAppt(a.id) })">Annuler</button>
                    </template>
                  </template>
                </div>
              </div>

            </div>
          </div>
          </div><!-- /sa-list -->
        </div><!-- /wrapper -->
      </div>

    </div><!-- /tab-content -->

    <!-- ── MODAL STAFF CARD ── -->
    <Teleport to="body">
      <div v-if="selectedStaffModal" class="staff-modal-overlay" @click.self="selectedStaffModal = null">
        <div class="staff-modal">
          <!-- Header -->
          <div class="sm-header" :class="`sm-header--${selectedStaffModal.color}`">
            <div class="sm-av" :class="`sc-av-${selectedStaffModal.id % 4}`">
              {{ selectedStaffModal.name.charAt(0).toUpperCase() }}
            </div>
            <div class="sm-info">
              <div class="sm-name">{{ selectedStaffModal.name }}</div>
              <div class="sm-status" :class="selectedStaffModal.isAbsent ? 'st-absent' : `st-${selectedStaffModal.color}`">
                {{ selectedStaffModal.isAbsent ? 'En congé aujourd\'hui'
                  : selectedStaffModal.color === 'free' ? 'Libre'
                  : selectedStaffModal.currentSvc
                    ? selectedStaffModal.currentSvc + (selectedStaffModal.minsLeft != null ? ' · ' + (selectedStaffModal.minsLeft > 0 ? selectedStaffModal.minsLeft + ' min restants' : 'bientôt libre') : '')
                    : 'En cours' }}
              </div>
            </div>
            <button class="sm-close" @click="selectedStaffModal = null">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- Corps : liste des RDV -->
          <div class="sm-body">
            <div v-if="!staffAppts(selectedStaffModal).length && !staffWalkins(selectedStaffModal).length" class="sm-empty">
              Aucun rendez-vous aujourd'hui
            </div>
            <div
              v-for="a in [...staffAppts(selectedStaffModal), ...staffWalkins(selectedStaffModal)].sort((x,y) => ((x.time||'').split('–')[0] < (y.time||'').split('–')[0] ? -1 : 1))"
              :key="a.svcId || a.id"
              class="sm-row"
              :class="{ 'sm-row--current': a.status === 'current', 'sm-row--done': a.status === 'past' }"
            >
              <div class="sm-row-left">
                <span class="sm-time">{{ (a.time || '').split('–')[0].trim() }}</span>
                <span v-if="a._isWalkin" class="sm-walkin-tag">Sans RDV</span>
              </div>
              <div class="sm-row-body">
                <div class="sm-client">{{ a.client }}</div>
                <div class="sm-svc">{{ a.service }}<span v-if="a.duration"> · {{ a.duration }}min</span></div>
              </div>
              <div class="sm-row-action" @click.stop>
                <span v-if="a.status === 'past'" class="sm-badge-done">Terminé</span>
                <button v-else-if="a.status === 'current'" class="sm-btn sm-btn--finish"
                  :class="{ 'sm-btn--confirm': pendingFinish === (a.svcId || a.id) }"
                  @click="askFinish(a.id, a.svcId)">
                  {{ pendingFinish === (a.svcId || a.id) ? 'Confirmer ?' : '✓ Terminer' }}
                </button>
                <button v-else-if="a.status === 'upcoming'" class="sm-btn sm-btn--arrive"
                  @click="checkIn(a.id)">
                  Arrivée ✓
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── MODALS ── -->
    <ToastContainer />
    <AddWalkinModal v-if="showAddWalkin" :today="testDateOverride" :staff="staffWithColor" :services="services" :appointments="appointments" @close="showAddWalkin = false" @refresh="fetchData" />
    <ServeWalkinModal v-if="showServeModal" :walkin="selectedWalkin" :staff="staffWithColor" :services="services" :externalConflicts="externalConflicts" :appointments="appointments" @close="showServeModal = false" @refresh="fetchData" />
    <RecapRdvModal v-if="showRecapModal && selectedRecapAppt" :appointment="selectedRecapAppt" :staff="staffWithColor" :services="services" @close="showRecapModal = false" @refresh="fetchData" @serve="onRecapServe" @finish="onRecapFinish" @encaisser="openEncaisserFromAppt" />
    <ServeServiceModal v-if="showServeServiceModal && selectedServeService" :appointment="selectedServeService.appointment" :service="selectedServeService.service" :staff="staffWithColor" :services="services" :externalConflicts="externalConflicts" :appointments="appointments" @close="showServeServiceModal = false" @refresh="fetchData" />
    <CaisseDrawer v-if="showCaisseDrawer" :date="getToday()" @close="showCaisseDrawer = false" @refresh="fetchData" @encaisser="openEncaisserById" />
    <EncaisserModal v-if="showEncaisserModal && encaisserTarget" :row="encaisserTarget" @close="showEncaisserModal = false; encaisserTarget = null" @refresh="fetchData" />
    <EditApptModal v-if="showRdvEditModal && rdvEditTarget" :appointment="rdvEditTarget" :staff="staffWithColor" :services="services" @close="showRdvEditModal = false; rdvEditTarget = null" @refresh="fetchData" @encaisser="openEncaisserFromAppt" />
    <AddServiceToApptModal v-if="showAddServiceModal && addServiceTarget" :appointment="addServiceTarget" :staff="staffWithColor" :services="services" @close="showAddServiceModal = false; addServiceTarget = null" @refresh="fetchData" />

    <!-- Confirmation générique -->
    <Teleport to="body">
      <div v-if="confirmDialog.show" class="t-overlay" @click.self="confirmDialog.show = false">
        <div class="t-confirm">
          <h3 class="t-confirm-title">{{ confirmDialog.title }}</h3>
          <p class="t-confirm-msg">{{ confirmDialog.message }}</p>
          <div class="t-confirm-actions">
            <button class="btn" :class="confirmDialog.danger ? 'btn-danger' : 'btn-primary'" @click="executeConfirm">{{ confirmDialog.btnLabel }}</button>
            <button class="btn btn-secondary" @click="confirmDialog.show = false">Retour</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Alerte compétence -->
    <div v-if="heavyAssignWarning" class="t-overlay" @click.self="heavyAssignWarning = ''; pendingHeavyAssign = null">
      <div class="t-confirm">
        <h3 class="t-confirm-title">Prestation complexe</h3>
        <p class="t-confirm-msg">{{ heavyAssignWarning }}</p>
        <div class="t-confirm-actions">
          <button class="btn btn-primary" @click="confirmHeavyAssign">Confirmer quand même</button>
          <button class="btn btn-secondary" @click="heavyAssignWarning = ''; pendingHeavyAssign = null">Modifier</button>
        </div>
      </div>
    </div>

    <!-- Dev date panel -->
    <div v-if="isDev" class="dev-date-panel">
      <span class="dev-label">🧪 Date de test</span>
      <input type="date" class="dev-date-input" :value="testDateOverride" @change="setTestDate($event.target.value)" />
      <button v-if="testDateOverride" class="dev-reset-btn" @click="setTestDate('')">Réinitialiser</button>
    </div>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&display=swap');

/* ── LAYOUT ── */
.today-layout {
  display: flex; flex-direction: column;
  height: 100vh; overflow: hidden;
  background: var(--bg-main);
  color: var(--text-main);
  font-family: 'Inter', sans-serif;
}

/* ── TOPBAR ── */
.today-topbar {
  display: flex; align-items: center; gap: 16px;
  padding: 0 22px; height: 56px;
  background: rgba(245,242,234,.96);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border);
  position: relative;
  z-index: 10; flex-shrink: 0;
}
.tb-left { display: flex; flex-direction: column; gap: 1px; }
.tb-title {
  font-family: 'Sora', sans-serif;
  font-size: 17px; font-weight: 700; color: var(--text-main);
  display: flex; align-items: center; gap: 8px;
}
.tb-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--primary); box-shadow: 0 0 8px rgba(212,175,55,.4);
}
.tb-date { font-size: 11px; color: var(--text-muted); font-weight: 500; text-transform: capitalize; }
.tb-time { color: var(--primary); font-weight: 700; }

.tb-stats { display: flex; align-items: center; gap: 5px; margin-left: 20px; }
.stat-chip {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 20px;
  background: var(--bg-soft); border: 1px solid var(--border-strong);
  font-size: 11px; font-weight: 700; color: var(--text-muted); white-space: nowrap;
}
.sc-num { font-size: 13px; font-weight: 800; }
.c-orange .sc-num { color: var(--orange); }
.c-blue   .sc-num { color: var(--blue); }
.c-green  .sc-num { color: var(--green); }
.c-muted  .sc-num { color: var(--text-muted); }
.c-gold   .sc-num { color: var(--primary); }

.tb-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.tb-btn-outline {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 13px; border-radius: 9px;
  background: transparent; border: 1px solid var(--border-strong);
  color: var(--text-muted); font-size: 12px; font-weight: 600; cursor: pointer;
  font-family: inherit; transition: all .15s;
}
.tb-btn-outline:hover { color: var(--primary); border-color: var(--primary-mid); background: var(--primary-soft); }
.tb-btn-caisse { color: var(--green); border-color: rgba(21,128,61,.25); }
.tb-btn-caisse:hover { color: var(--green); border-color: var(--green); background: rgba(21,128,61,.08); }
.tb-btn-primary {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 15px; border-radius: 9px;
  background: var(--primary); color: #fff; border: none;
  font-size: 12px; font-weight: 700; cursor: pointer;
  font-family: inherit; box-shadow: 0 0 16px rgba(212,175,55,.3);
  transition: all .15s;
}
.tb-btn-primary:hover { background: var(--primary-light); box-shadow: 0 0 24px rgba(212,175,55,.45); transform: translateY(-1px); }

/* ── STAFF STRIP ── */
.staff-strip {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 22px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  overflow-x: auto; flex-shrink: 0;
}
.staff-strip::-webkit-scrollbar { height: 3px; }
.staff-strip::-webkit-scrollbar-thumb { background: var(--primary-soft); border-radius: 2px; }

.sc-chip {
  display: flex; align-items: center; gap: 7px;
  padding: 6px 12px; border-radius: 20px;
  background: var(--bg-soft); border: 1px solid var(--border);
  white-space: nowrap; flex-shrink: 0; cursor: pointer;
  transition: border-color .15s, box-shadow .15s, transform .15s;
}
.sc-chip:hover {
  border-color: var(--border-strong);
  box-shadow: 0 4px 12px rgba(0,0,0,.08);
  transform: translateY(-2px);
}
.sc-chip--absent { opacity: .45; }
.sc-chip--absent:hover { transform: none; box-shadow: none; border-color: var(--border); background: var(--bg-soft); }
.sc-chip--absent:hover .sc-name { color: var(--text-main); }

.sc-chip--external { opacity: .55; filter: grayscale(.6); }
.sc-chip--external:hover { transform: none; box-shadow: none; }

.sc-av {
  width: 26px; height: 26px; border-radius: 50%;
  font-size: 11px; font-weight: 800; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.sc-av-0 { background: rgba(168,129,10,.15); color: var(--primary); }
.sc-av-1 { background: rgba(29,78,216,.10); color: var(--blue); }
.sc-av-2 { background: rgba(21,128,61,.10);  color: var(--green); }
.sc-av-3 { background: rgba(168,129,10,.10); color: var(--primary); }

.sc-info { display: flex; flex-direction: column; gap: 1px; }
.sc-name { font-size: 12px; font-weight: 700; color: var(--text-main); }
.sc-status { font-size: 10px; font-weight: 600; }
.sc-mins { font-size: 9.5px; color: var(--text-muted); margin-top: 1px; }

.st-free   { color: var(--green); }
.st-busy   { color: var(--primary); }
.st-loaded { color: var(--orange); }
.st-full   { color: var(--red); }
.st-absent { color: var(--text-muted); }

.sc-progress { height: 3px; border-radius: 2px; background: var(--border); margin-top: 4px; width: 72px; overflow: hidden; }
.sc-progress-fill { height: 100%; border-radius: 2px; background: var(--primary); transition: width .3s; }

.sc-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot-free   { background: var(--green);   box-shadow: 0 0 6px rgba(74,222,128,.5); }
.dot-busy   { background: var(--primary); box-shadow: 0 0 6px rgba(212,175,55,.4); }
.dot-loaded { background: var(--orange);  box-shadow: 0 0 6px rgba(245,158,11,.4); }
.dot-full   { background: var(--red);     box-shadow: 0 0 6px rgba(248,113,113,.4); }
.dot-absent { background: var(--text-light); }

/* ── TABS BAR ── */
.tabs-bar {
  display: flex; align-items: center; gap: 2px;
  padding: 0 22px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.tab-btn {
  display: flex; align-items: center; gap: 7px;
  padding: 12px 16px 11px;
  border: none; background: transparent;
  font-family: inherit; font-size: 12px; font-weight: 600; color: var(--text-muted);
  cursor: pointer; border-bottom: 2px solid transparent;
  margin-bottom: -1px; transition: color .15s; white-space: nowrap;
}
.tab-btn:hover { color: var(--text-main); }
.tab-btn.active { color: var(--text-main); border-bottom-color: var(--primary); }

.tab-badge {
  min-width: 18px; height: 18px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 800; padding: 0 5px;
  background: rgba(0,0,0,.07); color: var(--text-muted);
}
.tbadge-gold { background: rgba(168,129,10,.18); color: var(--primary); }

/* ── TAB CONTENT ── */
.tab-content { flex: 1; overflow: hidden; }
.tab-panel { height: 100%; overflow-y: auto; padding: 16px 22px; display: flex; flex-direction: column; gap: 0; }
.tab-panel::-webkit-scrollbar { width: 4px; }
.tab-panel::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

/* Loading / Empty */
.t-loading { display: flex; justify-content: center; padding: 48px 0; }
.t-spinner { width: 22px; height: 22px; border: 2.5px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.t-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 60px 20px; color: var(--text-muted); font-size: 13px; font-weight: 500; }

/* ── TAB 1 : QUEUE ── */
.q-section-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em;
  color: var(--text-light); padding: 14px 0 8px;
}
.q-section-title:first-child { padding-top: 0; }
.q-section-title--warn { color: var(--orange); }
.q-sec-badge {
  min-width: 18px; height: 18px; border-radius: 9px; padding: 0 5px;
  background: rgba(212,175,55,.12); color: var(--primary);
  font-size: 10px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center;
}
.q-sec-badge--warn { background: rgba(245,158,11,.12); color: var(--orange); }

.q-row {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; margin-bottom: 5px;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 13px; cursor: pointer;
  transition: border-color .15s;
}
.q-row:hover { border-color: var(--border-strong); }
.q-row--unassigned { border-color: rgba(245,158,11,.2); background: rgba(245,158,11,.03); }
.q-row--unassigned:hover { border-color: rgba(245,158,11,.3); }

.q-rank {
  width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
  background: var(--primary-soft); color: var(--primary);
  font-size: 11px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
}
.q-rank--warn { background: rgba(245,158,11,.12); color: var(--orange); font-size: 13px; font-weight: 900; }

.q-av {
  width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
  font-size: 15px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.q-info { flex: 1; min-width: 0; }
.q-client {
  font-size: 13px; font-weight: 700; color: var(--text-main);
  display: flex; align-items: center; gap: 6px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.q-svc { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.q-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
.q-arrival { font-size: 10.5px; color: var(--text-muted); }
.q-wait { font-size: 11px; font-weight: 700; color: var(--text-muted); }
.q-wait--long { color: var(--orange); }
.q-wait--urgent { color: var(--red); }

.q-serve-btn {
  padding: 7px 14px; border-radius: 9px; flex-shrink: 0;
  background: var(--primary); color: #fff; border: none;
  font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit;
  transition: background .15s; white-space: nowrap;
  box-shadow: 0 0 12px rgba(212,175,55,.25);
}
.q-serve-btn:hover { background: var(--primary-light); }

.q-assign-btn {
  padding: 7px 14px; border-radius: 9px; flex-shrink: 0;
  background: rgba(245,158,11,.12); color: var(--orange);
  border: 1px solid rgba(245,158,11,.25);
  font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit;
  transition: all .15s; white-space: nowrap;
}
.q-assign-btn:hover { background: rgba(245,158,11,.22); }

.q-del-btn {
  width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
  background: transparent; border: 1px solid rgba(248,113,113,.2);
  color: var(--red); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.q-del-btn:hover { background: rgba(248,113,113,.12); }

/* ── TAB 2 : PLANNING ── */
.plan-toolbar {
  display: flex; justify-content: flex-end; margin-bottom: 8px;
}
.plan-toggle-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-radius: 8px; border: 1px solid var(--border-strong);
  background: transparent; color: var(--text-muted);
  font-size: 11px; font-weight: 700; font-family: inherit; cursor: pointer;
  transition: all .15s;
}
.plan-toggle-btn:hover { background: rgba(0,0,0,.04); color: var(--text-main); }

.plan-list { display: flex; flex-direction: column; gap: 4px; padding-top: 4px; }

.plan-row {
  display: grid;
  grid-template-columns: 76px 1fr 120px 96px 220px auto;
  align-items: center; gap: 10px;
  padding: 11px 14px;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 11px; cursor: pointer;
  transition: border-color .15s;
}
.plan-row:hover { border-color: var(--border-strong); }
.plan-row--done { opacity: .5; }
.plan-row--walkin { border-left: 2.5px solid var(--primary-mid); }

.p-time-col { display: flex; flex-direction: column; gap: 3px; }
.p-time { font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 700; color: var(--text-muted); }
.p-walkin-badge {
  font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 99px;
  background: var(--primary-soft); color: var(--primary);
  border: 1px solid var(--primary-mid);
}
.p-overdue-date {
  font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 99px;
  background: rgba(220,38,38,.1); color: var(--red);
  border: 1px solid rgba(220,38,38,.25);
}

.p-body { min-width: 0; }
.p-client {
  font-size: 13px; font-weight: 700; color: var(--text-main);
  display: flex; align-items: center; gap: 5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.p-svc { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.p-staff {
  font-size: 12px; color: var(--text-muted);
  display: flex; align-items: center; gap: 5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.p-badge-col { display: flex; justify-content: center; }
.p-badge { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 99px; font-size: 10px; font-weight: 700; white-space: nowrap; }
.p-badge--green { background: rgba(74,222,128,.1); color: var(--green); }
.p-badge--blue  { background: rgba(147,197,253,.1); color: var(--blue); }
.p-badge--done  { background: rgba(0,0,0,.06); color: var(--text-muted); }
.p-badge--cash  { background: rgba(217,119,6,.12); color: var(--orange); border: 1px solid rgba(217,119,6,.25); font-weight: 700; }
.p-badge--muted { background: rgba(0,0,0,.05); color: var(--text-light); }
.p-badge--red   { background: rgba(248,113,113,.1); color: var(--red); }

.p-actions { display: flex; gap: 5px; justify-content: flex-end; align-items: center; }
.p-btn {
  padding: 5px 11px; border-radius: 8px; border: 1px solid transparent;
  font-size: 11px; font-weight: 700; cursor: pointer; font-family: inherit;
  white-space: nowrap; transition: all .15s;
}
.p-btn--green  { background: var(--green-soft); color: var(--green); border-color: rgba(21,128,61,.2); }
.p-btn--green:hover  { background: var(--green); color: #fff; }
.p-btn--gold   { background: var(--primary-soft); color: var(--primary); border-color: var(--primary-mid); }
.p-btn--gold:hover   { background: var(--primary); color: #fff; }
.p-btn--ghost  { background: transparent; color: var(--text-muted); border-color: var(--border-strong); }
.p-btn--ghost:hover  { color: var(--text-main); border-color: rgba(0,0,0,.22); background: rgba(0,0,0,.04); }
.p-btn--cancel { background: transparent; color: var(--red); border-color: rgba(220,38,38,.25); }
.p-btn--cancel:hover { background: var(--red-soft); }
.p-btn--confirm { background: var(--primary); color: #fff; border: none; animation: pulse .5s ease infinite alternate; }
.p-btn--enc-split { background: var(--primary); color: #fff; border: none; font-weight: 800; }
.p-btn--enc-split:hover { background: #8A6A08; }
.p-btn--later { background: transparent; color: var(--text-muted); border-color: var(--border-strong); }
.p-btn--later:hover { color: var(--text-main); background: rgba(0,0,0,.04); }
@keyframes pulse { from { opacity: .85; } to { opacity: 1; } }

.p-end-actions { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
.p-btn-enc {
  width: 30px; height: 30px; border-radius: 7px;
  background: rgba(21,128,61,.08); border: 1px solid rgba(21,128,61,.25);
  color: var(--green); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all .12s; flex-shrink: 0;
}
.p-btn-enc:hover { background: var(--green); color: #fff; border-color: var(--green); }
.p-btn-add {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 7px; border: 1px solid transparent;
  background: transparent; color: var(--text-light); cursor: pointer;
  transition: all .15s; flex-shrink: 0;
}
.p-btn-add:hover { background: var(--green-soft, rgba(21,128,61,.08)); color: var(--green); border-color: rgba(21,128,61,.25); }
.p-btn-edit {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 7px; border: 1px solid transparent;
  background: transparent; color: var(--text-light); cursor: pointer;
  transition: all .15s; flex-shrink: 0;
}
.p-btn-edit:hover { background: var(--primary-soft); color: var(--primary); border-color: var(--primary-mid); }
.p-btn-del {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 7px; border: 1px solid transparent;
  background: transparent; color: var(--text-light); cursor: pointer;
  transition: all .15s; flex-shrink: 0;
}
.p-btn-del:hover { background: var(--red-soft); color: var(--red); border-color: rgba(220,38,38,.2); }

/* ── TAB 3 : STAFF ACCORDION ── */
.sa-list { display: flex; flex-direction: column; gap: 6px; padding-top: 4px; }

.sa-accordion {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 13px; overflow: hidden; transition: border-color .15s;
}
.sa-accordion:hover { border-color: var(--border-strong); }
.sa-open { border-color: var(--border-strong); }
.sa-absent { opacity: .5; }

.sa-header {
  display: flex; align-items: center; gap: 11px;
  padding: 13px 16px; cursor: pointer; user-select: none;
  transition: background .12s;
}
.sa-header:hover { background: rgba(255,255,255,.02); }

.sa-av {
  width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
  font-size: 15px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.sa-info { flex: 1; min-width: 0; }
.sa-name { font-size: 13px; font-weight: 700; color: var(--text-main); }
.sa-sub { font-size: 11.5px; margin-top: 2px; }
.sa-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.sa-count {
  font-size: 11px; font-weight: 700; color: var(--text-muted);
  background: rgba(0,0,0,.05); border-radius: 10px;
  padding: 2px 8px; flex-shrink: 0;
}
.sa-chevron { color: var(--text-light); transition: transform .2s; flex-shrink: 0; }
.sa-chevron--open { transform: rotate(180deg); }

.sa-body { border-top: 1px solid var(--border); }

.sa-absent-banner {
  display: flex; align-items: center; gap: 7px;
  padding: 10px 16px; color: var(--text-muted); font-size: 12px;
}
.sa-overlap {
  margin: 8px 16px 0; padding: 6px 10px; border-radius: 8px;
  font-size: 11px; font-weight: 700; color: var(--orange);
  background: rgba(245,158,11,.1); border: 1px solid rgba(245,158,11,.2);
}
.sa-ext-banner {
  padding: 6px 16px;
  font-size: 11px; font-weight: 600; color: var(--blue);
  background: rgba(147,197,253,.06); border-bottom: 1px solid rgba(147,197,253,.1);
}
.sa-empty { display: flex; align-items: center; gap: 6px; padding: 16px; color: var(--text-muted); font-size: 12px; }

.sa-appt-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px; border-bottom: 1px solid var(--border);
  cursor: pointer; transition: background .1s;
}
.sa-appt-row:last-child { border-bottom: none; }
.sa-appt-row:hover { background: rgba(255,255,255,.02); }
.sa-appt-row--current { background: rgba(212,175,55,.04); }
.sa-appt-row--walkin { opacity: .85; }

.sa-a-time { font-family: 'Sora', sans-serif; font-size: 11.5px; font-weight: 700; color: var(--text-muted); min-width: 90px; flex-shrink: 0; }
.sa-a-client { flex: 1; min-width: 0; }
.sa-a-name { font-size: 12.5px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 4px; }
.sa-a-svc  { font-size: 11px; color: var(--text-muted); margin-top: 1px; }
.sa-a-dur  {
  font-size: 10px; font-weight: 600; color: var(--text-light);
  background: rgba(0,0,0,.04); border: 1px solid var(--border);
  border-radius: 5px; padding: 2px 7px; flex-shrink: 0;
}
.sa-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; flex-shrink: 0; }
.sa-badge--green { background: rgba(74,222,128,.1); color: var(--green); }
.sa-badge--blue  { background: rgba(147,197,253,.1); color: var(--blue); }
.sa-badge--done  { background: rgba(0,0,0,.06); color: var(--text-muted); }
.sa-badge--cash  { background: rgba(217,119,6,.12); color: var(--orange); border: 1px solid rgba(217,119,6,.25); font-weight: 700; }
.sa-badge--muted { background: rgba(0,0,0,.05); color: var(--text-light); }
.sa-badge--red   { background: rgba(248,113,113,.1); color: var(--red); }
.sa-badge--gold  { background: var(--primary-soft); color: var(--primary); border: 1px solid var(--primary-mid); }

.sa-actions { display: flex; gap: 5px; align-items: center; flex-shrink: 0; }
.sa-btn {
  padding: 4px 10px; border-radius: 7px; border: 1px solid transparent;
  font-size: 11px; font-weight: 700; cursor: pointer; font-family: inherit;
  white-space: nowrap; transition: all .15s;
}
.sa-btn--green  { background: var(--green-soft); color: var(--green); border-color: rgba(21,128,61,.2); }
.sa-btn--green:hover  { background: var(--green); color: #fff; }
.sa-btn--gold   { background: var(--primary-soft); color: var(--primary); border-color: var(--primary-mid); }
.sa-btn--gold:hover   { background: var(--primary); color: #fff; }
.sa-btn--ghost  { background: transparent; color: var(--text-muted); border-color: var(--border-strong); }
.sa-btn--ghost:hover  { color: var(--text-main); border-color: rgba(0,0,0,.22); background: rgba(0,0,0,.04); }
.sa-btn--cancel { background: transparent; color: var(--red); border-color: rgba(220,38,38,.25); }
.sa-btn--cancel:hover { background: var(--red-soft); }
.sa-btn--confirm { background: var(--primary); color: #fff; border: none; animation: pulse .5s ease infinite alternate; }
.sa-btn--enc-split { background: var(--primary); color: #fff; border: none; font-weight: 800; }
.sa-btn--enc-split:hover { background: #8A6A08; }
.sa-btn--later { background: transparent; color: var(--text-muted); border-color: var(--border-strong); }
.sa-btn--later:hover { color: var(--text-main); background: rgba(0,0,0,.04); }

/* ── SHARED BADGES ── */
.flag-inline { flex-shrink: 0; }

/* ── OVERLAY / CONFIRM ── */
.t-overlay {
  position: fixed; inset: 0; background: rgba(20,16,8,.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 200; backdrop-filter: blur(4px);
}
.t-confirm {
  background: var(--bg-soft); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 24px;
  width: 360px; max-width: calc(100vw - 32px);
  box-shadow: var(--shadow-lg);
}
.t-confirm-title { font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 8px; }
.t-confirm-msg   { font-size: 13px; color: var(--text-muted); margin-bottom: 20px; line-height: 1.5; }
.t-confirm-actions { display: flex; gap: 8px; }

/* ── DEV PANEL ── */
.dev-date-panel {
  position: fixed; bottom: 12px; right: 12px;
  background: var(--bg-soft); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 8px 12px;
  display: flex; align-items: center; gap: 8px;
  z-index: 999; font-size: 12px;
}
.dev-label { color: var(--text-muted); font-weight: 600; }
.dev-date-input { background: var(--bg-card); border: 1px solid var(--border); color: var(--text-main); border-radius: 6px; padding: 4px 8px; font-size: 11px; font-family: inherit; }
.dev-reset-btn { background: var(--red-soft); color: var(--red); border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer; font-family: inherit; font-weight: 600; }

/* ── LEGACY (appt-badge, etc. used by modals passed through) ── */
.appt-badge { font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 99px; }
.appt-badge--done      { background: rgba(74,222,128,.1); color: var(--green); }
.appt-badge--cancelled { background: rgba(0,0,0,.06); color: var(--text-muted); }
.appt-badge--noshow    { background: rgba(0,0,0,.06); color: var(--text-muted); }

/* ══════════════════════════════════════════
   RESPONSIVE — mobile (≤ 640px)
   ══════════════════════════════════════════ */
@media (max-width: 640px) {

  /* ── Topbar ── */
  .today-topbar { padding: 0 14px; height: 52px; gap: 6px; }
  .tb-left  { flex: 1; min-width: 0; }
  .tb-title { font-size: 15px; }
  .tb-date  { font-size: 10px; }

  /* Stats masquées sur mobile */
  .tb-stats { display: none; }

  /* Boutons : icône seule */
  .tb-right { flex-shrink: 0; }
  .tb-btn-outline span,
  .tb-btn-primary span { display: none; }
  .tb-btn-outline,
  .tb-btn-primary { padding: 6px 10px; }

  /* ── Staff strip ── */
  .staff-strip { padding: 8px 14px; }

  /* ── Tabs bar ── */
  .tabs-bar   { padding: 0 14px; overflow-x: auto; }
  .tab-btn    { padding: 10px 12px 9px; font-size: 11.5px; gap: 5px; }

  /* ── Layout : contraindre à la largeur CSS viewport ── */
  .today-layout { overflow-x: hidden; width: 100%; }
  .tab-content  { overflow-x: hidden; width: 100%; max-width: 100%; }
  .tab-panel    { padding: 12px 14px; overflow-x: hidden; }
  .plan-list    { width: 100%; }

  /* ── Plan toolbar ── */
  .plan-toolbar { flex-wrap: wrap; gap: 6px; }
  .plan-toggle-btn { font-size: 10.5px; padding: 4px 10px; }

  /* ── Planning grid : 3 colonnes (temps | corps | action | supp) ── */
  .plan-row {
    width: 100%; box-sizing: border-box;
    grid-template-columns: 56px 1fr auto 28px;
    gap: 8px;
    padding: 10px 12px;
  }
  .p-staff     { display: none; }
  .p-badge-col { display: none; }

  /* Corps : afficher le staff inline sous la prestation */
  .p-svc::after { content: ''; }

  /* Actions : garder uniquement le bouton principal */
  .p-actions { gap: 4px; }
  .p-btn--ghost,
  .p-btn--cancel { display: none; }
  .p-btn { padding: 5px 10px; font-size: 10.5px; }

  /* ── File d'attente ── */
  .q-row    { padding: 10px 12px; gap: 10px; }
  .q-info   { min-width: 0; }

  /* ── Staff accordion ── */
  .sa-accordion { border-radius: 10px; }
  .sa-header    { padding: 12px 14px; }
  .sa-body      { padding: 0; }
  .sa-appt-row  { padding: 10px 14px; flex-wrap: wrap; gap: 6px; }
  .sa-a-time    { min-width: 70px; }
  .sa-actions   { width: 100%; justify-content: flex-end; }

  /* ── Staff modal (déjà en slide-up, juste ajuster max-width) ── */
  .staff-modal { border-radius: 16px 16px 0 0; max-height: 85vh; }
}

/* ── STAFF MODAL ── */
.staff-modal-overlay {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(20,16,8,.45); backdrop-filter: blur(4px);
  display: flex; align-items: flex-end; justify-content: center;
  padding: 0;
}
.staff-modal {
  width: 100%; max-width: 480px;
  background: var(--bg-main); border-radius: 20px 20px 0 0;
  border: 1px solid var(--border); border-bottom: none;
  overflow: hidden;
  animation: slideUp .22s ease;
  max-height: 80vh; display: flex; flex-direction: column;
}
@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.sm-header {
  display: flex; align-items: center; gap: 12px;
  padding: 18px 18px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-soft);
}
.sm-header--free    { border-top: 3px solid var(--green); }
.sm-header--busy    { border-top: 3px solid var(--primary); }
.sm-header--loaded  { border-top: 3px solid var(--orange); }
.sm-header--full    { border-top: 3px solid var(--red); }

.sm-av {
  width: 44px; height: 44px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 800; flex-shrink: 0;
}
.sm-info { flex: 1; min-width: 0; }
.sm-name { font-size: 16px; font-weight: 800; color: var(--text-main); }
.sm-status { font-size: 12px; margin-top: 2px; }

.sm-close {
  width: 32px; height: 32px; border-radius: 50%; background: rgba(0,0,0,.06);
  border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); flex-shrink: 0; transition: background .12s;
}
.sm-close:hover { background: rgba(0,0,0,.12); }

.sm-body { overflow-y: auto; flex: 1; padding: 8px 0; }

.sm-empty {
  padding: 32px 18px; text-align: center;
  font-size: 13px; color: var(--text-muted);
}

.sm-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 18px; border-bottom: 1px solid var(--border);
  transition: background .12s;
}
.sm-row:last-child { border-bottom: none; }
.sm-row--current { background: rgba(212,175,55,.05); }
.sm-row--done    { opacity: .5; }

.sm-row-left { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; min-width: 60px; flex-shrink: 0; }
.sm-time { font-family: 'Sora', sans-serif; font-size: 12.5px; font-weight: 800; color: var(--text-muted); }
.sm-walkin-tag {
  font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 99px;
  background: var(--primary-soft); color: var(--primary); border: 1px solid var(--primary-mid);
}

.sm-row-body { flex: 1; min-width: 0; }
.sm-client { font-size: 13.5px; font-weight: 700; color: var(--text-main); }
.sm-svc    { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; }

.sm-row-action { flex-shrink: 0; }
.sm-badge-done {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  color: var(--text-light); letter-spacing: .04em;
}
.sm-btn {
  padding: 6px 14px; border-radius: 8px; border: none;
  font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit;
  white-space: nowrap; transition: all .15s;
}
.sm-btn--finish  { background: var(--green); color: #fff; }
.sm-btn--finish:hover { filter: brightness(1.1); }
.sm-btn--arrive  { background: var(--primary-soft); color: var(--primary); border: 1px solid var(--primary-mid); }
.sm-btn--arrive:hover { background: var(--primary); color: #fff; }
.sm-btn--confirm { background: var(--orange); color: #fff; animation: pulse .4s ease infinite alternate; }
</style>
