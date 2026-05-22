<script setup>
/* ==============================
   IMPORTS
============================== */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import BaseModal from '@/components/modal/BaseModal.vue'
import CustomSelect from '@/components/common/CustomSelect.vue'
import { findClientByPhone, fetchAllClients } from '@/services/clients.service'
import { formatPhone, isValidPhone } from '@/utils/phone'
import { supabase } from '@/lib/supabase'
import { getOrgId } from '@/composables/useOrgId'
import { fetchSettings } from '@/services/settings.service'
import { rankStaff } from '@/composables/useStaffRanking'

/* ==============================
   PROPS / EMITS
============================== */
const props = defineProps({
  open: Boolean,
  rdv: Object,
  services: Array,
  categories: Array,
  staff: Array
})

const emit = defineEmits(['close', 'save'])

/* ==============================
   MODE (CREATE / EDIT)
============================== */
const isEditMode = computed(() => !!props.rdv)

/* ==============================
   FORM STATE — CLIENT
============================== */
const clientId = ref(null)
const clientName = ref('')
const clientLastName = ref('')
const clientPhone = ref('')
const clientFlagged = ref(false)

const clientDetected = ref(false)
const forceEditClient = ref(false)
const hadDetectedClient = ref(false)

// Recherche client dans la liste
const allClients = ref([])
const clientSearch = ref('')
const showClientDropdown = ref(false)
const skipPhoneWatch = ref(false) // empêche le watcher téléphone de réinitialiser après pickClient

const clientSearchRef = ref(null)

// Appointments du jour sélectionné (pour ranking staff)
const dayAppointments = ref([])

async function fetchDayAppointments(date) {
  if (!date) { dayAppointments.value = []; return }
  try {
    const orgId = await getOrgId()
    const { data } = await supabase
      .from('appointments')
      .select('id, start_time, is_external, external_period, status, appointment_services(staff_id, staff:staff_id(id), service:service_id(duration_minutes))')
      .eq('organization_id', orgId)
      .gte('start_time', `${date}T00:00:00`)
      .lte('start_time', `${date}T23:59:59`)
      .in('status', ['scheduled', 'confirmed', 'in_progress'])
    // Exclure le RDV en cours d'édition pour ne pas compter son propre créneau dans le workload
    dayAppointments.value = (data || []).filter(a => !props.rdv || a.id !== props.rdv.id)
  } catch (e) {
    dayAppointments.value = []
  }
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DEFAULT_HOURS = { mon:{active:true,open:'08:00',close:'20:00'}, tue:{active:true,open:'08:00',close:'20:00'}, wed:{active:true,open:'08:00',close:'20:00'}, thu:{active:true,open:'08:00',close:'20:00'}, fri:{active:true,open:'08:00',close:'20:00'}, sat:{active:true,open:'08:00',close:'20:00'}, sun:{active:false,open:'08:00',close:'20:00'} }
const openingHours = ref(DEFAULT_HOURS)

function handleClickOutsideSearch(e) {
  if (clientSearchRef.value && !clientSearchRef.value.contains(e.target)) {
    showClientDropdown.value = false
  }
}

onMounted(async () => {
  try { allClients.value = await fetchAllClients() } catch (e) { console.error(e) }
  try {
    const s = await fetchSettings()
    if (s?.opening_hours) openingHours.value = { ...DEFAULT_HOURS, ...s.opening_hours }
  } catch (e) { console.error(e) }
  // Initialiser au premier créneau valide si pas en mode édition
  if (!props.rdv && !appointmentTime.value && timeSlots.value.length) {
    appointmentTime.value = timeSlots.value[0]
  }
  fetchDayAppointments(appointmentDate.value)
  document.addEventListener('mousedown', handleClickOutsideSearch)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutsideSearch)
})

const filteredClients = computed(() => {
  const q = clientSearch.value.toLowerCase().replace(/\s/g, '')
  if (!q) return allClients.value
  return allClients.value.filter(c => {
    const full = ((c.name || '') + (c.last_name || '')).toLowerCase().replace(/\s/g, '')
    const phone = (c.phone || '').replace(/\s/g, '')
    return full.includes(q) || phone.includes(q)
  })
})

function pickClient(c) {
  skipPhoneWatch.value = true
  clientId.value = c.id
  clientName.value = c.name || ''
  clientLastName.value = c.last_name || ''
  clientPhone.value = formatPhone(c.phone || '')
  clientFlagged.value = !!c.is_flagged
  clientDetected.value = true
  hadDetectedClient.value = true
  forceEditClient.value = false
  clientSearch.value = ''
  showClientDropdown.value = false
  // relâcher le verrou au prochain tick (après que le watcher ait tourné)
  setTimeout(() => { skipPhoneWatch.value = false }, 50)
}

function clearPickedClient() {
  clientId.value = null
  clientName.value = ''
  clientLastName.value = ''
  clientPhone.value = ''
  clientFlagged.value = false
  clientDetected.value = false
  hadDetectedClient.value = false
  clientSearch.value = ''
}

/* ==============================
   FORM STATE — RDV
============================== */
const appointmentDate = ref(new Date().toLocaleDateString('en-CA'))
const appointmentTime = ref(null)
const isExternal = ref(false)
const externalPeriod = ref(null)

/* ==============================
   FORM STATE — PRESTATIONS
============================== */
const categoryId = ref(null)
const selectedServiceId = ref(null)

const selectedServices = ref([])
/*
{
  service_id,
  service_name,
  staff_id
}
*/

/* ==============================
   UI STATE
============================== */
const showStaffWarning    = ref(false)
const heavyAlert          = ref('')
const showHeavyConfirm    = ref(false)
const showConflictConfirm = ref(false)
const conflictMessages    = ref([])
const isSaving            = ref(false)

function getHeavyWarning() {
  for (const s of selectedServices.value) {
    const svc = props.services?.find(sv => sv.id === s.service_id)
    if (!svc?.is_heavy) continue
    if (!s.staff_id) return `"${svc.name}" est une prestation complexe — aucun collaborateur n'est affecté.`
    const staff = props.staff?.find(st => st.id === s.staff_id)
    if (!staff?.categories?.some(c => c.id === svc.category_id))
      return `"${svc.name}" est une prestation complexe — ${staff?.name || 'ce collaborateur'} n'a pas la compétence requise.`
  }
  return ''
}

const errors = ref({
  firstName: null,
  date: null,
  time: null,
  services: null,
  clientPhone: null
})

/* ==============================
   COMPUTED
============================== */
function dayHoursForDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T12:00:00')
  return openingHours.value[DAY_KEYS[d.getDay()]] || null
}

const isDayClosed = computed(() => {
  const h = dayHoursForDate(appointmentDate.value)
  return h ? !h.active : false
})

const timeSlots = computed(() => {
  if (isDayClosed.value) return []

  const dayH = dayHoursForDate(appointmentDate.value)
  let openH = 8, openM = 0, closeH = 20, closeM = 0
  if (dayH?.open)  { const [h,m] = dayH.open.split(':').map(Number);  openH = h; openM = m }
  if (dayH?.close) { const [h,m] = dayH.close.split(':').map(Number); closeH = h; closeM = m }

  const slots = []
  for (let h = openH; h <= closeH; h++) {
    for (const m of [0, 30]) {
      if (h === openH && m < openM) continue
      if (h === closeH && m > closeM) continue
      slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`)
    }
  }

  // Aujourd'hui : garder uniquement les créneaux à +1h minimum
  const today = new Date().toLocaleDateString('en-CA')
  if (appointmentDate.value !== today) return slots
  const minTime = new Date(Date.now() + 60 * 60 * 1000)
  const minH = minTime.getHours(), minM = minTime.getMinutes()
  return slots.filter(slot => {
    const [h, m] = slot.split(':').map(Number)
    return h > minH || (h === minH && m >= minM)
  })
})

const filteredServices = computed(() => {
  return (props.services || []).filter(s => {
    if (s.is_active === false) return false
    if (categoryId.value && s.category_id !== categoryId.value) return false
    return true
  })
})

/* ==============================
   HELPERS
============================== */
function capitalizeWords(value) {
  if (!value) return ''
  return value
    .toLowerCase()
    .split(/([\s-'])/)
    .map(part =>
      /^[a-zà-ÿ]/i.test(part)
        ? part.charAt(0).toUpperCase() + part.slice(1)
        : part
    )
    .join('')
}

function formatLastName(value) {
  return value ? value.toUpperCase() : ''
}

/* ==============================
   WATCHERS — VALIDATION CLEANUP
============================== */
watch(clientName, () => {
  if (clientName.value.trim()) errors.value.firstName = null
})

watch(clientPhone, val => {
  if (errors.value.clientPhone && isValidPhone(val)) {
    errors.value.clientPhone = null
  }
})

function staffForService(serviceId) {
  if (!props.staff) return [{ id: null, name: 'Non assigné' }]

  const ranked = rankStaff({
    staffList:    props.staff,
    serviceId,
    services:     props.services,
    targetDate:   appointmentDate.value,
    targetTime:   appointmentTime.value || '09:00',
    appointments: dayAppointments.value
  })

  return [
    { id: null, name: 'Non assigné' },
    ...ranked.map(sm => ({
      ...sm,
      danger: sm._unavailable || undefined,
      hint:   sm._unavailableReason || undefined,
      badge:  sm._recommended ? 'Recommandé' : undefined
    }))
  ]
}

watch(appointmentDate, (date) => {
  if (date) errors.value.date = null

  // Jour fermé : vider l'heure
  if (isDayClosed.value) { appointmentTime.value = null; return }

  // Si l'heure actuelle n'est plus dans les créneaux valides, prendre le premier dispo
  if (timeSlots.value.length && !timeSlots.value.includes(appointmentTime.value)) {
    appointmentTime.value = timeSlots.value[0]
  }

  // Rafraîchir les appointments du jour pour le ranking
  fetchDayAppointments(date)
})

watch(appointmentTime, () => {
  if (appointmentTime.value) errors.value.time = null
})

watch(
  selectedServices,
  () => {
    if (selectedServices.value.length) errors.value.services = null
  },
  { deep: true }
)

/* ==============================
   WATCHER — PÉRIODE EXTERNE AUTO
============================== */
function periodFromTime(time) {
  const h = parseInt((time || '09:00').split(':')[0], 10)
  if (h < 13) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

watch(isExternal, val => {
  if (val && !externalPeriod.value) {
    externalPeriod.value = periodFromTime(appointmentTime.value)
  }
})

watch(appointmentTime, val => {
  if (isExternal.value) {
    externalPeriod.value = periodFromTime(val)
  }
})

/* ==============================
   WATCHER — CLIENT DETECTION
============================== */
watch(clientPhone, async val => {
  if (skipPhoneWatch.value) return
  if (forceEditClient.value) return
  const phone = val?.replace(/\s/g, '')
  forceEditClient.value = false

  let client = null
  try {
    if (phone && phone.length >= 10) {
      client = await findClientByPhone(phone)
    }
  } catch (e) {
    console.error('CLIENT DETECTION ERROR 👉', e)
  }

  if (!phone || phone.length < 10) {
    if (hadDetectedClient.value) {
      clientName.value = ''
      clientLastName.value = ''
    }
    clientDetected.value = false
    clientId.value = null
    hadDetectedClient.value = false
    return
  }

  if (client) {
    clientDetected.value = true
    clientId.value = client.id
    hadDetectedClient.value = true
    clientName.value = client.name
    clientLastName.value = client.last_name || ''
    return
  }

  clientDetected.value = false
  clientId.value = null

  if (hadDetectedClient.value) {
    clientName.value = ''
    clientLastName.value = ''
  }

  hadDetectedClient.value = false
})

/* ==============================
   VALIDATION
============================== */
function validate() {
  let valid = true

  errors.value = {
    firstName: null,
    date: null,
    time: null,
    services: null,
    clientPhone: null
  }

  if (!clientId.value && !clientPhone.value.trim()) {
    errors.value.clientPhone = 'Le téléphone est obligatoire'
    valid = false
  } else if (clientPhone.value && !isValidPhone(clientPhone.value)) {
    errors.value.clientPhone = 'Format invalide (ex: 06 12 34 56 78)'
    valid = false
  }

  if (!clientName.value.trim()) {
    errors.value.firstName = 'Le prénom est obligatoire'
    valid = false
  }

  if (!appointmentDate.value) {
    errors.value.date = 'La date est obligatoire'
    valid = false
  }

  if (!appointmentTime.value) {
    errors.value.time = "L'heure est obligatoire"
    valid = false
  }

  if (!selectedServices.value.length) {
    errors.value.services = 'Ajoutez au moins une prestation'
    valid = false
  }

  return valid
}

/* ==============================
   FORCE STAFF INDISPONIBLE
============================== */
const forceStaffConfirm = ref({ show: false, serviceId: null, staffId: null, prevStaffId: null, message: '' })

watch(
  () => selectedServices.value.map(s => s.staff_id),
  (newIds, oldIds) => {
    for (let i = 0; i < newIds.length; i++) {
      const newId = newIds[i]
      if (!newId || newId === oldIds?.[i]) continue
      const svcId = selectedServices.value[i].service_id
      const ranked = rankStaff({
        staffList:    props.staff,
        serviceId:    svcId,
        services:     props.services,
        targetDate:   appointmentDate.value,
        targetTime:   appointmentTime.value || '09:00',
        appointments: dayAppointments.value
      })
      const sm = ranked.find(s => s.id === newId)
      if (sm?._unavailable) {
        forceStaffConfirm.value = {
          show: true,
          serviceId: svcId,
          staffId: newId,
          prevStaffId: oldIds?.[i] ?? null,
          message: `${sm.name} est indisponible (${sm._unavailableReason}). Forcer quand même ?`
        }
        break // traiter un seul conflit à la fois
      }
    }
  }
)

function cancelForceStaff() {
  const { serviceId, prevStaffId } = forceStaffConfirm.value
  const svc = selectedServices.value.find(s => s.service_id === serviceId)
  if (svc) svc.staff_id = prevStaffId
  forceStaffConfirm.value = { show: false, serviceId: null, staffId: null, prevStaffId: null, message: '' }
}

function confirmForceStaff() {
  forceStaffConfirm.value = { show: false, serviceId: null, staffId: null, prevStaffId: null, message: '' }
}

/* ==============================
   ACTIONS
============================== */
function enableClientEdit() {
  forceEditClient.value = true
}

function addService() {
  if (!selectedServiceId.value) return

  const service = props.services.find(s => s.id === selectedServiceId.value)
  if (!service) return

  if (selectedServices.value.some(s => s.service_id === service.id)) return

  selectedServices.value.push({
    id:               null,
    service_id:       service.id,
    service_name:     service.name,
    staff_id:         null,
    price_at_booking: service.price ?? null,
    is_parallel:      false
  })

  selectedServiceId.value = null
}

function removeService(index) {
  const removed = selectedServices.value[index]
  selectedServices.value.splice(index, 1)
  if (selectedServiceId.value === removed?.service_id) selectedServiceId.value = null
}

async function save() {
  if (!validate()) return
  const warn = getHeavyWarning()
  if (warn) { heavyAlert.value = warn; showHeavyConfirm.value = true; return }
  await proceedSave()
}

// Convertit HH:MM ou une ISO string en minutes depuis minuit — sans new Date() pour éviter le décalage UTC
function toMinutes(str) {
  const time = str?.length > 5 ? str.substring(11, 16) : str
  const [h, m] = (time || '00:00').split(':').map(Number)
  return h * 60 + (m || 0)
}

// Returns true if newStartMin falls within the external period range
function isInExternalPeriod(newStartMin, period) {
  if (period === 'allday') return true
  if (period === 'morning')   return newStartMin < 13 * 60       // before 13:00
  if (period === 'afternoon') return newStartMin >= 13 * 60 && newStartMin < 18 * 60
  if (period === 'evening')   return newStartMin >= 18 * 60
  return false
}

const PERIOD_LABELS_FR = { morning: 'le matin', afternoon: "l'après-midi", evening: 'le soir', allday: 'toute la journée' }

async function checkConflicts() {
  const apptDate = appointmentDate.value
  const newStartMin = toMinutes(appointmentTime.value)
  const orgId = await getOrgId()

  const { data: dayAppts, error } = await supabase
    .from('appointments')
    .select('id, start_time, is_external, external_period, client:client_id(name, last_name), appointment_services(id, status, staff_id, service:service_id(duration_minutes))')
    .eq('organization_id', orgId)
    .gte('start_time', apptDate + 'T00:00:00')
    .lte('start_time', apptDate + 'T23:59:59')
    .in('status', ['scheduled', 'confirmed', 'in_progress'])

  if (error) { console.error('[checkConflicts] supabase error:', error); return [] }

  const otherAppts = (dayAppts || []).filter(a => !props.rdv || a.id !== props.rdv.id)
  const conflicts = []

  for (const s of selectedServices.value) {
    if (!s.staff_id) continue
    const svc = props.services?.find(sv => sv.id === s.service_id)
    const newEndMin = newStartMin + (svc?.duration_minutes || 30)
    const staffName = props.staff?.find(st => st.id === s.staff_id)?.name || 'Ce collaborateur'

    for (const appt of otherAppts) {
      const staffSvcs = (appt.appointment_services || []).filter(
        as => as.staff_id === s.staff_id && as.status !== 'cancelled'
      )
      if (!staffSvcs.length) continue

      if (appt.is_external && appt.external_period) {
        // Conflict based on period
        if (isInExternalPeriod(newStartMin, appt.external_period)) {
          const periodLabel = PERIOD_LABELS_FR[appt.external_period] || appt.external_period
          conflicts.push(`${staffName} est en déplacement externe ${periodLabel}`)
        }
      } else {
        // Regular time overlap
        const apptStartMin = toMinutes(appt.start_time)
        for (const as of staffSvcs) {
          const apptEndMin = apptStartMin + (as.service?.duration_minutes || 30)
          if (newStartMin < apptEndMin && newEndMin > apptStartMin) {
            const c = appt.client
            const clientName = c ? [c.name, c.last_name].filter(Boolean).join(' ') : 'un client'
            conflicts.push(`${staffName} a déjà un RDV à ${appt.start_time.substring(11, 16)} avec ${clientName}`)
          }
        }
      }
    }
  }

  return [...new Set(conflicts)]
}

async function proceedSave() {
  showHeavyConfirm.value = false
  heavyAlert.value = ''
  isSaving.value = true

  try {
    const conflicts = await checkConflicts()
    if (conflicts.length) {
      conflictMessages.value = conflicts
      showConflictConfirm.value = true
      return
    }
    afterConflictCheck()
  } catch (e) {
    console.error('[proceedSave] error:', e)
    afterConflictCheck()
  } finally {
    isSaving.value = false
  }
}

function afterConflictCheck() {
  showConflictConfirm.value = false
  const hasAnyStaff = selectedServices.value.some(s => s.staff_id)
  if (!hasAnyStaff) { showStaffWarning.value = true; return }
  confirmSave()
}

function confirmSave() {
  const time = appointmentTime.value
  const start_time = `${appointmentDate.value}T${time}:00`

  emit('save', {
    id: props.rdv?.id || null,
    client_id: clientId.value || null,
    client: {
      name: clientName.value,
      last_name: clientLastName.value,
      phone: clientPhone.value || null
    },
    start_time,
    is_external: isExternal.value,
    external_period: isExternal.value ? externalPeriod.value : null,
    services: selectedServices.value.map(s => ({
      id:               s.id || null,
      service_id:       s.service_id,
      staff_id:         s.staff_id,
      price_at_booking: s.price_at_booking ?? null,
      is_parallel:      s.is_parallel || false
    }))
  })

  showStaffWarning.value = false
}

/* ==============================
   INIT (EDIT / CREATE)
============================== */
watch(
  () => props.rdv,
  val => {
    if (!val) {
      clientId.value = null
      clientName.value = ''
      clientLastName.value = ''
      clientPhone.value = ''
      appointmentDate.value = new Date().toLocaleDateString('en-CA')
      appointmentTime.value = timeSlots.value[0] || null
      selectedServices.value = []
      isExternal.value = false
      return
    }

    // Normalise les relations Supabase qui peuvent être objet, tableau ou tableau vide
    const one = v => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

    const client = one(val.client)
    clientId.value = client?.id || null
    clientName.value = client?.name || ''
    clientLastName.value = client?.last_name || ''
    clientPhone.value = formatPhone(client?.phone || '')
    isExternal.value = !!val.is_external
    externalPeriod.value = val.external_period || null

    if (val.start_time) {
      appointmentDate.value = val.start_time.slice(0, 10)
      appointmentTime.value = val.start_time.slice(11, 16)
    }

    selectedServices.value = Array.isArray(val.appointment_services)
      ? val.appointment_services
          .filter(as => as.status !== 'cancelled')     // ignorer les prestations annulées
          .map(as => {
            const svc  = one(as.service)
            const staff = one(as.staff)
            if (!svc?.id) return null                   // ignorer si service supprimé du catalogue
            return {
              id:               as.id || null,
              service_id:       svc.id,
              service_name:     svc.name || '',
              staff_id:         staff?.id || null,
              price_at_booking: as.price_at_booking ?? props.services?.find(s => s.id === svc.id)?.price ?? null,
              is_parallel:      as.is_parallel || false
            }
          })
          .filter(Boolean)
      : []

  },
  { immediate: true }
)
</script>


<template>
  <BaseModal v-if="open" :title="rdv ? 'Modifier un RDV' : 'Ajouter un RDV'" @close="$emit('close')">

    <div class="modal-body">

      <!-- =========================
           CLIENT
      ========================== -->
        <!-- Téléphone -->
        <!-- Recherche client existant -->
        <div class="form-group">
          <label>Rechercher un client</label>
          <div v-if="clientDetected && !forceEditClient" class="picked-client" :class="{ 'picked-flagged': clientFlagged }">
            <div class="picked-avatar" :class="{ 'picked-avatar-flagged': clientFlagged }">{{ clientName?.charAt(0)?.toUpperCase() }}</div>
            <div class="picked-info">
              <div class="picked-name" style="display:flex;align-items:center;gap:6px;">
                {{ clientName }} {{ clientLastName }}
                <span v-if="clientFlagged" class="opt-flag-badge">⚠ Signalé</span>
              </div>
              <div class="picked-phone">{{ clientPhone || 'Pas de téléphone' }}</div>
            </div>
            <button class="picked-clear" @click="clearPickedClient">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div v-else class="client-search-wrap" ref="clientSearchRef">
            <div class="search-input-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-light);pointer-events:none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                v-model="clientSearch"
                type="text"
                placeholder="Nom ou téléphone…"
                @focus="showClientDropdown = true"
                style="padding-left:34px;"
              />
            </div>
            <div v-if="showClientDropdown && filteredClients.length" class="client-dropdown">
              <div
                v-for="c in filteredClients"
                :key="c.id"
                class="client-option"
                @mousedown.prevent="pickClient(c)"
              >
                <div class="opt-avatar" :class="{ 'opt-avatar-flagged': c.is_flagged }">{{ c.name?.charAt(0)?.toUpperCase() }}</div>
                <div style="flex:1;min-width:0;">
                  <div class="opt-name" style="display:flex;align-items:center;gap:6px;">
                    {{ c.name }} {{ c.last_name || '' }}
                    <span v-if="c.is_flagged" class="opt-flag-badge">⚠ Signalé</span>
                  </div>
                  <div class="opt-phone">{{ c.phone || '—' }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label>Téléphone</label>
          <div class="field-row">
            <input :value="clientPhone" @input="clientPhone = formatPhone($event.target.value)" type="tel"
              inputmode="tel" placeholder="Ex: 06 12 34 56 78"
              :class="{ 'client-locked': clientDetected && !forceEditClient }" />
            <p v-if="errors.clientPhone" class="form-error">{{ errors.clientPhone }}</p>
          </div>
        </div>

        <!-- Prénom -->
        <div class="form-group">
          <label>Prénom *</label>
          <div class="field-row">
            <input type="text" v-model="clientName" placeholder="Prénom du client" @input="clientName = capitalizeWords($event.target.value)"
              :class="{ 'client-locked': clientDetected && !forceEditClient }" />
            <p v-if="errors.firstName" class="form-error">{{ errors.firstName }}</p>
          </div>
        </div>

        <!-- Nom -->
        <div class="form-group">
          <label>Nom</label>
          <div class="field-row">
            <input type="text" v-model="clientLastName" placeholder="Nom du client"
              @input="clientLastName = formatLastName($event.target.value)"
              :class="{ 'client-locked': clientDetected && !forceEditClient }" />
          </div>
        </div>

        <!-- NOTIFICATIONS CLIENT DÉTECTÉ -->
        <div v-if="clientDetected && !forceEditClient" class="client-detected-info">
          <span class="client-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Client reconnu
          </span>
          <button v-if="isEditMode" class="btn-link-sm" @click="enableClientEdit">
            Modifier les infos
          </button>
        </div>

      <div class="form-divider"></div>

      <!-- =========================
           DATE / HEURE / EXTERNE
      ========================== -->
        <div class="form-group">
          <label>Date & heure</label>

          <div class="date-time-row">
            <input type="date" v-model="appointmentDate" :min="new Date().toLocaleDateString('en-CA')" />
            <CustomSelect
                v-model="appointmentTime"
                :options="timeSlots"
                placeholder="Heure"
                :iconType="'none'"
                :disabled="isDayClosed"
            />
          </div>

          <p v-if="isDayClosed" class="form-error">
            ⛔ Le salon est fermé ce jour — veuillez choisir une autre date.
          </p>
          <p v-else-if="errors.date" class="form-error">{{ errors.date }}</p>
          <p v-else-if="errors.time" class="form-error">{{ errors.time }}</p>
        </div>

        <!-- RDV EXTERNE -->
        <div class="form-group">
          <label>Rdv externe</label>
          <label class="toggle">
            <input type="checkbox" v-model="isExternal" />
            <span class="toggle-switch"></span>
          </label>
        </div>

        <div v-if="isExternal" class="form-group">
          <label>Période</label>
          <div class="period-selector">
            <button type="button" class="period-btn" :class="{ active: externalPeriod === 'morning' }" @click="externalPeriod = 'morning'">🌅 Matin</button>
            <button type="button" class="period-btn" :class="{ active: externalPeriod === 'afternoon' }" @click="externalPeriod = 'afternoon'">☀️ Après-midi</button>
            <button type="button" class="period-btn" :class="{ active: externalPeriod === 'evening' }" @click="externalPeriod = 'evening'">🌙 Soir</button>
            <button type="button" class="period-btn" :class="{ active: externalPeriod === 'allday' }" @click="externalPeriod = 'allday'">📅 Journée</button>
          </div>
        </div>

      <div class="form-divider"></div>

      <!-- =========================
           PRESTATIONS
      ========================== -->
      <div>
        <label class="form-label">Prestations</label>

        <!-- Filtres de recherche -->
        <div class="service-picker">
          <div class="picker-filters">
            <CustomSelect
              v-model="categoryId"
              :options="[{ id: null, name: 'Toutes catégories' }, ...(categories || [])]"
              placeholder="Toutes catégories"
              :iconType="'none'"
            />
          </div>
          <div class="picker-add-row">
            <CustomSelect
              v-model="selectedServiceId"
              :options="filteredServices"
              placeholder="Choisir une prestation…"
              :iconType="'none'"
              class="picker-service-select"
            />
            <button class="btn btn-primary btn-sm" :disabled="!selectedServiceId" @click="addService">
              + Ajouter
            </button>
          </div>
          <p v-if="errors.services" class="form-error">{{ errors.services }}</p>
        </div>

        <!-- Liste des prestations ajoutées -->
        <div v-if="selectedServices.length" class="services-list">
          <div class="services-list-header">
            <span>Prestation</span>
            <span>Collaborateur</span>
            <span>Prix</span>
            <span></span>
          </div>
          <div v-for="(s, i) in selectedServices" :key="i" class="service-item">
            <span class="service-item-name">{{ s.service_name }}</span>
            <CustomSelect
              v-model="s.staff_id"
              :options="staffForService(s.service_id)"
              placeholder="Non assigné"
              :iconType="'none'"
              class="service-item-staff"
            />
            <div class="price-inline-wrap">
              <input
                v-model="s.price_at_booking"
                type="number" min="0" step="1"
                placeholder="—"
                class="price-inline-input"
              />
              <span class="price-inline-suffix">DH</span>
            </div>
            <label v-if="i > 0" class="parallel-toggle" :title="s.is_parallel ? 'Simultané avec la précédente' : 'Séquentiel'">
              <input type="checkbox" v-model="s.is_parallel" />
              <span>⟺</span>
            </label>
            <div v-else style="width:28px"></div>
            <button class="remove-btn" @click="removeService(i)" title="Retirer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <div v-else class="services-empty">
          Aucune prestation ajoutée
        </div>
      </div>
    </div>

    <!-- =========================
         ACTIONS
    ========================== -->
    <div class="modal-actions">
      <button class="btn btn-secondary" @click="$emit('close')">
        Annuler
      </button>
      <button class="btn btn-primary" :disabled="isSaving" @click="save">
        <span v-if="isSaving" class="saving-spinner"></span>
        {{ isSaving ? 'Vérification…' : 'Enregistrer' }}
      </button>
    </div>

    <!-- Confirmation force staff indisponible -->
    <BaseModal v-if="forceStaffConfirm.show" title="Collaborateur indisponible" @close="cancelForceStaff">
      <div class="modal-body">
        <div class="conflict-alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;color:var(--orange)"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>{{ forceStaffConfirm.message }}</span>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="cancelForceStaff">Annuler</button>
        <button class="btn btn-primary" @click="confirmForceStaff">Forcer quand même</button>
      </div>
    </BaseModal>

    <!-- Confirmation chevauchement staff -->
    <BaseModal v-if="showConflictConfirm" title="Conflit de planning" @close="showConflictConfirm = false">
      <div class="modal-body">
        <div class="conflict-alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;margin-top:1px;color:var(--orange)"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <ul class="conflict-list">
            <li v-for="msg in conflictMessages" :key="msg">{{ msg }}</li>
          </ul>
        </div>
        <p class="confirm-hint">Ce créneau est déjà occupé. Voulez-vous forcer le rendez-vous quand même ?</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="showConflictConfirm = false">Modifier</button>
        <button class="btn btn-primary btn-warning-solid" @click="afterConflictCheck">Forcer quand même</button>
      </div>
    </BaseModal>

    <!-- Confirmation service complexe -->
    <BaseModal v-if="showHeavyConfirm" title="Prestation complexe" @close="showHeavyConfirm = false">
      <div class="modal-body">
        <div class="heavy-alert">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          {{ heavyAlert }}
        </div>
        <p class="confirm-hint">Voulez-vous modifier votre sélection ou confirmer quand même ?</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="showHeavyConfirm = false">Modifier</button>
        <button class="btn btn-primary" @click="proceedSave">Confirmer quand même</button>
      </div>
    </BaseModal>

    <!-- =========================
         STAFF WARNING
    ========================== -->
    <BaseModal v-if="showStaffWarning" title="Confirmer le RDV" @close="showStaffWarning = false">
      <div class="modal-body">
        <p class="warning-text">
          Aucun staff n'est affecté à ce rendez-vous.<br />
          Voulez-vous continuer quand même ?
        </p>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" @click="showStaffWarning = false">
          Revenir
        </button>
        <button class="btn btn-primary btn-warning-solid" @click="confirmSave">
          Continuer sans staff
        </button>
      </div>
    </BaseModal>

  </BaseModal>
</template>
<style scoped>
/* DATE + TIME */
.date-time-row {
  display: grid;
  grid-template-columns: 1fr 110px;
  gap: 10px;
  align-items: center;
}

/* PICKER (filtres + ajout) */
.service-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: var(--bg-main);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 16px;
}

.picker-filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.picker-add-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.picker-service-select {
  flex: 1;
}

.btn-sm {
  padding: 0 16px;
  height: 38px;
  font-size: 13px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* LISTE DES PRESTATIONS */
.services-list {
  border: 1px solid var(--border);
  border-radius: 8px;
}

.services-list-header {
  display: grid;
  grid-template-columns: 1fr 160px 90px 32px;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-main);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  border-radius: 8px 8px 0 0;
}

.service-item {
  display: grid;
  grid-template-columns: 1fr 160px 90px 28px 32px;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  position: relative;
}

.price-inline-wrap {
  position: relative;
}
.price-inline-input {
  width: 100%;
  padding: 6px 28px 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  color: var(--text-main);
  background: var(--bg-card);
  box-sizing: border-box;
}
.price-inline-input:focus { outline: none; border-color: var(--primary); }
.price-inline-suffix {
  position: absolute; right: 7px; top: 50%; transform: translateY(-50%);
  font-size: 11px; color: var(--text-muted); pointer-events: none; font-weight: 600;
}

.service-item:last-child {
  border-bottom: none;
}

.parallel-toggle {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; cursor: pointer; flex-shrink: 0;
  border: 1.5px solid var(--border); border-radius: 6px;
  font-size: 13px; color: var(--text-muted); transition: all .12s;
  user-select: none;
}
.parallel-toggle:has(input:checked) { border-color: var(--blue); background: var(--blue-soft); color: var(--blue); }
.parallel-toggle input { display: none; }

.service-item-name {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-main);
}

.service-item-staff {
  width: 160px;
}

.remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.remove-btn:hover {
  background: var(--red-soft);
  border-color: var(--red);
  color: var(--red);
}

/* VIDE */
.services-empty {
  text-align: center;
  padding: 20px;
  font-size: 13px;
  color: var(--text-light);
  border: 1px dashed var(--border);
  border-radius: 8px;
}

/* CLIENT */
.client-locked {
  opacity: 0.7;
  cursor: not-allowed;
  border-style: dashed;
}

.client-detected-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding: 8px 12px;
  background: var(--green-soft);
  border-radius: 8px;
  border: 1px solid var(--green);
}

.client-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--green);
  font-weight: 600;
}

.btn-link-sm {
  background: transparent;
  border: none;
  color: var(--primary);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 4px;
}

.btn-link-sm:hover { text-decoration: underline; }

/* WARNING */
.warning-text {
  font-size: 13px;
  color: var(--text-main);
  line-height: 1.6;
}

/* CLIENT SEARCH */
.client-search-wrap { position: relative; }
.search-input-row { position: relative; }
.search-input-row input { width: 100%; box-sizing: border-box; }

.client-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0; right: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.12);
  z-index: 9999;
  max-height: 280px;
  overflow-y: auto;
}
.client-dropdown::-webkit-scrollbar { width: 4px; }
.client-dropdown::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 10px; }
.client-option {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; cursor: pointer;
  border-bottom: 1px solid var(--border);
  transition: background .12s;
}
.client-option:last-child { border-bottom: none; }
.client-option:hover { background: var(--bg-main); }
.opt-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: var(--primary-soft); color: var(--primary-text);
  font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.opt-name { font-size: 13px; font-weight: 600; color: var(--text-main); }
.opt-phone { font-size: 11px; color: var(--text-muted); }
.opt-avatar-flagged { background: var(--orange-soft); color: var(--orange); }
.opt-flag-badge { font-size: 10px; font-weight: 700; background: var(--orange-soft); color: var(--orange); border: 1px solid var(--orange); border-radius: 999px; padding: 1px 6px; white-space: nowrap; }

.picked-client {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  background: var(--primary-soft);
  border: 1px solid var(--primary);
  border-radius: 8px;
}
.picked-flagged { background: var(--orange-soft); border-color: var(--orange); }
.picked-avatar {
  width: 34px; height: 34px; border-radius: 50%;
  background: var(--primary); color: #fff;
  font-size: 14px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.picked-avatar-flagged { background: var(--orange); color: #fff; }
.picked-info { flex: 1; min-width: 0; }
.picked-name { font-size: 13.5px; font-weight: 700; color: var(--text-main); }
.picked-phone { font-size: 11.5px; color: var(--text-muted); margin-top: 1px; }
.picked-clear {
  background: transparent; border: none; cursor: pointer;
  color: var(--text-muted); padding: 4px; border-radius: 4px;
  display: flex; align-items: center;
}
.picked-clear:hover { color: var(--text-main); }

.period-selector { display: flex; gap: 8px; }
.period-selector .period-btn {
  flex: 1; padding: 8px 10px; border: 1px solid var(--border); border-radius: 9px;
  background: var(--bg-soft); font-size: 13px; font-weight: 600; color: var(--text-muted);
  cursor: pointer; transition: all .15s; text-align: center;
}
.period-selector .period-btn:hover { border-color: var(--primary); color: var(--primary); }
.period-selector .period-btn.active { border-color: var(--primary); background: var(--primary); color: #fff; }

.saving-spinner {
  display: inline-block; width: 12px; height: 12px;
  border: 2px solid rgba(255,255,255,.4); border-top-color: #fff;
  border-radius: 50%; animation: spin .6s linear infinite; margin-right: 6px; vertical-align: middle;
}
@keyframes spin { to { transform: rotate(360deg); } }

.conflict-alert { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; background: var(--orange-soft); border: 1px solid var(--orange); border-radius: 9px; color: var(--orange); font-size: 13px; line-height: 1.5; }
.conflict-list { margin: 0; padding: 0 0 0 16px; }
.conflict-list li { margin-bottom: 4px; }
.conflict-list li:last-child { margin-bottom: 0; }

.heavy-alert { display: flex; align-items: flex-start; gap: 8px; padding: 10px 13px; background: var(--orange-soft); border: 1px solid var(--orange); border-radius: 9px; color: var(--orange); font-size: 13px; line-height: 1.45; }
.heavy-alert svg { flex-shrink: 0; margin-top: 1px; color: var(--orange); }
.confirm-hint { font-size: 13px; color: var(--text-muted); margin-top: 10px; line-height: 1.5; }

@media (max-width: 560px) {
  .picker-filters { grid-template-columns: 1fr; }
  .services-list-header { display: none; }
  .service-item { grid-template-columns: 1fr 80px 32px; grid-template-rows: auto auto; }
  .service-item-staff { grid-column: 1 / -2; }
  .price-inline-wrap { grid-column: 2; }
  .remove-btn { grid-column: 2; grid-row: 1; }
}
</style>