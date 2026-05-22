<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const route = useRoute()
const router = useRouter()

const orgId = route.params.orgId
const clientName = route.query.name || ''
const clientLastName = route.query.last_name || ''
const clientPhone = route.query.phone || ''

if (!clientName || !clientPhone) {
  router.replace('/booking')
}

// ── state ──────────────────────────────────────────────────────────────────
const org = ref(null)
const services = ref([])
const staffList = ref([])
const loading = ref(true)

const selectedServices = ref([]) // array of { ...service, staffId: null }
const calendarMonth = ref(new Date().toISOString().slice(0, 7))
const availableDays = ref([])
const selectedDate = ref(null)
const slots = ref([])
const slotsLoading = ref(false)
const selectedSlot = ref(null)

const step = ref('service') // 'service' | 'datetime' | 'confirm'
const confirming = ref(false)
const confirmed = ref(false)
const confirmResult = ref(null)
const errorMsg = ref('')

// ── init ───────────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    const [orgRes, svcRes, staffRes] = await Promise.all([
      fetch(`${API}/booking/${orgId}/info`),
      fetch(`${API}/booking/${orgId}/services`),
      fetch(`${API}/booking/${orgId}/staff`)
    ])
    org.value = await orgRes.json()
    services.value = await svcRes.json()
    staffList.value = await staffRes.json()
  } catch {
    errorMsg.value = 'Impossible de charger les informations du salon.'
  } finally {
    loading.value = false
  }
})

// ── service selection ───────────────────────────────────────────────────────
function isSelected(svc) {
  return selectedServices.value.some(s => s.id === svc.id)
}

function toggleService(svc) {
  const idx = selectedServices.value.findIndex(s => s.id === svc.id)
  if (idx === -1) {
    selectedServices.value.push({ ...svc, staffId: null })
  } else {
    selectedServices.value.splice(idx, 1)
  }
}

function removeService(svc) {
  selectedServices.value = selectedServices.value.filter(s => s.id !== svc.id)
}

function setStaffForService(svcId, staffId) {
  const entry = selectedServices.value.find(s => s.id === svcId)
  if (entry) entry.staffId = staffId
}

function staffOptionsFor(svc) {
  if (!svc.category_id) return staffList.value
  return staffList.value.filter(s =>
    s.staff_categories?.some(sc => sc.category_id === svc.category_id)
  )
}

const totalPrice = computed(() =>
  selectedServices.value.reduce((sum, s) => sum + (s.price || 0), 0)
)

const totalDuration = computed(() =>
  selectedServices.value.reduce((sum, s) => sum + (s.duration_minutes || 0), 0)
)

// ── calendar ───────────────────────────────────────────────────────────────
const DAY_LABELS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']

const calendarDays = computed(() => {
  const [y, m] = calendarMonth.value.split('-').map(Number)
  const firstDay = new Date(y, m - 1, 1)
  const lastDay = new Date(y, m, 0)
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6
  const days = []
  for (let i = 0; i < startDow; i++) days.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const str = `${calendarMonth.value}-${String(d).padStart(2,'0')}`
    days.push(str)
  }
  return days
})

const monthLabel = computed(() => {
  const [y, m] = calendarMonth.value.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
})

const today = new Date().toLocaleDateString('en-CA')

function isAvailable(d) { return d && availableDays.value.includes(d) }
function isPast(d) { return d && d < today }

async function loadAvailableDays() {
  if (!selectedServices.value.length) return
  availableDays.value = []
  const first = selectedServices.value[0]
  const staffParam = first.staffId ? `&staffId=${first.staffId}` : ''
  const res = await fetch(`${API}/booking/${orgId}/available-days?month=${calendarMonth.value}&serviceId=${first.id}${staffParam}`)
  availableDays.value = await res.json()
}

watch(calendarMonth, () => { if (step.value === 'datetime') loadAvailableDays() })

function prevMonth() {
  const [y, m] = calendarMonth.value.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  if (d.toISOString().slice(0, 7) < today.slice(0, 7)) return
  calendarMonth.value = d.toISOString().slice(0, 7)
}
function nextMonth() {
  const [y, m] = calendarMonth.value.split('-').map(Number)
  calendarMonth.value = new Date(y, m, 1).toISOString().slice(0, 7)
}

async function selectDate(d) {
  if (!isAvailable(d)) return
  selectedDate.value = d
  selectedSlot.value = null
  slotsLoading.value = true
  const first = selectedServices.value[0]
  const staffParam = first.staffId ? `&staffId=${first.staffId}` : ''
  const res = await fetch(`${API}/booking/${orgId}/slots?date=${d}&serviceId=${first.id}${staffParam}`)
  const data = await res.json()
  slots.value = data.slots || []
  slotsLoading.value = false
}

// ── flow ───────────────────────────────────────────────────────────────────
async function goToDatetime() {
  if (!selectedServices.value.length) return
  step.value = 'datetime'
  calendarMonth.value = today.slice(0, 7)
  await loadAvailableDays()
}

function goToConfirm() {
  if (!selectedDate.value || !selectedSlot.value) return
  step.value = 'confirm'
}

async function confirmBooking() {
  confirming.value = true
  errorMsg.value = ''
  try {
    const res = await fetch(`${API}/booking/${orgId}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: clientName,
        last_name: clientLastName,
        phone: clientPhone,
        date: selectedDate.value,
        time: selectedSlot.value,
        services: selectedServices.value.map(s => ({
          serviceId: s.id,
          staffId: s.staffId || null
        }))
      })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erreur lors de la réservation')
    confirmResult.value = data
    confirmed.value = true
  } catch (e) {
    errorMsg.value = e.message
  } finally {
    confirming.value = false
  }
}

function formatDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

// ── services groupés par catégorie ─────────────────────────────────────────
const servicesByCategory = computed(() => {
  const groups = []
  const seen = new Set()

  for (const svc of services.value) {
    const cat = Array.isArray(svc.category) ? svc.category[0] : svc.category
    const catId   = cat?.id   || '__none__'
    const catName = cat?.name || 'Autres'
    const catColor = cat?.color || '#94a3b8'

    if (!seen.has(catId)) {
      seen.add(catId)
      groups.push({ id: catId, name: catName, color: catColor, services: [] })
    }
    groups.find(g => g.id === catId).services.push(svc)
  }
  return groups
})

const openCategory = ref(null)

function toggleCategory(catId) {
  openCategory.value = openCategory.value === catId ? null : catId
}

</script>

<template>
  <div class="bk-layout">
    <div class="bk-card wide">

      <!-- Loading -->
      <div v-if="loading" class="bk-loading" style="padding:60px">
        <div class="bk-spinner"></div>
        <span>Chargement…</span>
      </div>

      <template v-else-if="!confirmed">
        <!-- Header org -->
        <div class="bk-org-header">
          <div v-if="org?.logo_url" class="bk-org-logo-sm">
            <img :src="org.logo_url" :alt="org.name" />
          </div>
          <div v-else class="bk-org-avatar-sm">{{ org?.name?.charAt(0) }}</div>
          <div>
            <div class="bk-org-name-lg">{{ org?.name }}</div>
            <div class="bk-client-tag">{{ clientName }} {{ clientLastName }}</div>
          </div>
        </div>

        <!-- Progress steps -->
        <div class="bk-steps">
          <div :class="['bk-step', step === 'service' && 'active', step !== 'service' && 'done']">
            <span class="bk-step-num">{{ step !== 'service' ? '✓' : '1' }}</span>
            Prestation
          </div>
          <div class="bk-step-line"></div>
          <div :class="['bk-step', step === 'datetime' && 'active', step === 'confirm' && 'done']">
            <span class="bk-step-num">{{ step === 'confirm' ? '✓' : '2' }}</span>
            Date & heure
          </div>
          <div class="bk-step-line"></div>
          <div :class="['bk-step', step === 'confirm' && 'active']">
            <span class="bk-step-num">3</span>
            Confirmation
          </div>
        </div>

        <!-- STEP 1 : Services -->
        <template v-if="step === 'service'">
          <div class="bk-section-title">Choisissez vos prestations</div>

          <!-- Catégories -->
          <div class="cat-list">
            <div v-for="cat in servicesByCategory" :key="cat.id" class="cat-group">

              <!-- Header catégorie -->
              <button
                class="cat-header"
                :class="{ 'cat-open': openCategory === cat.id }"
                :style="{ '--cat-color': cat.color }"
                @click="toggleCategory(cat.id)"
              >
                <span class="cat-dot" :style="{ background: cat.color }"></span>
                <span class="cat-name">{{ cat.name }}</span>
                <span class="cat-count">{{ cat.services.length }} prestation{{ cat.services.length > 1 ? 's' : '' }}</span>
                <svg class="cat-chevron" :class="{ open: openCategory === cat.id }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>

              <!-- Services de la catégorie -->
              <div v-if="openCategory === cat.id" class="svc-list cat-body">
                <button
                  v-for="s in cat.services" :key="s.id"
                  :class="['svc-item', isSelected(s) && 'selected']"
                  @click="toggleService(s)"
                >
                  <div class="svc-info">
                    <div class="svc-name">{{ s.name }}</div>
                    <div class="svc-duration" v-if="s.duration_minutes">{{ s.duration_minutes }} min</div>
                  </div>
                  <div class="svc-price" v-if="s.price">{{ s.price }} MAD</div>
                  <div class="svc-check" v-if="isSelected(s)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="svc-add-icon" v-else>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </div>
                </button>
              </div>

            </div>
          </div>

          <!-- Panier prestations sélectionnées -->
          <div v-if="selectedServices.length" class="basket">
            <div class="basket-header">
              <span class="basket-title">Prestations sélectionnées</span>
              <span class="basket-total">{{ totalPrice }} MAD · {{ totalDuration }} min</span>
            </div>
            <div class="basket-items">
              <div v-for="entry in selectedServices" :key="entry.id" class="basket-item-block">
                <!-- Ligne prestation -->
                <div class="basket-item">
                  <span class="basket-item-name">{{ entry.name }}</span>
                  <span class="basket-item-price" v-if="entry.price">{{ entry.price }} MAD</span>
                  <button class="basket-remove" @click="removeService(entry)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <!-- Chips staff par prestation -->
                <div class="staff-chips">
                  <button
                    :class="['staff-chip', entry.staffId === null && 'active']"
                    @click="setStaffForService(entry.id, null)"
                  >
                    <span class="chip-avatar chip-any">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                    </span>
                    <span>Pas de préférence</span>
                  </button>
                  <button
                    v-for="st in staffOptionsFor(entry)" :key="st.id"
                    :class="['staff-chip', entry.staffId === st.id && 'active']"
                    @click="setStaffForService(entry.id, st.id)"
                  >
                    <span class="chip-avatar">
                      <img v-if="st.avatar_url" :src="st.avatar_url" :alt="st.name" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />
                      <span v-else>{{ st.name.charAt(0) }}</span>
                    </span>
                    <span>{{ st.name }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button class="bk-btn-primary" :disabled="!selectedServices.length" @click="goToDatetime" style="margin-top:24px;">
            Choisir la date
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </template>

        <!-- STEP 2 : Date & heure -->
        <template v-else-if="step === 'datetime'">
          <button class="bk-back-btn" @click="step = 'service'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            Retour
          </button>

          <div class="bk-recap-bar">
            <span class="recap-svc">{{ selectedServices.map(s => s.name).join(' + ') }}</span>
            <span class="recap-total">{{ totalPrice }} MAD</span>
          </div>

          <div class="cal-wrap">
            <!-- Month nav -->
            <div class="cal-nav">
              <button class="cal-nav-btn" @click="prevMonth">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span class="cal-month-label">{{ monthLabel }}</span>
              <button class="cal-nav-btn" @click="nextMonth">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>

            <!-- Day labels -->
            <div class="cal-grid">
              <div v-for="l in DAY_LABELS" :key="l" class="cal-day-label">{{ l }}</div>
              <button
                v-for="(day, i) in calendarDays" :key="i"
                :class="[
                  'cal-day',
                  !day && 'empty',
                  day === today && 'today',
                  isPast(day) && 'past',
                  isAvailable(day) && 'available',
                  selectedDate === day && 'selected-day'
                ]"
                :disabled="!isAvailable(day)"
                @click="selectDate(day)"
              >
                <span v-if="day">{{ parseInt(day.slice(-2)) }}</span>
              </button>
            </div>
          </div>

          <!-- Slots -->
          <div v-if="selectedDate" class="slots-section">
            <div class="bk-section-title">{{ formatDate(selectedDate) }}</div>
            <div v-if="slotsLoading" class="bk-loading" style="padding:20px;">
              <div class="bk-spinner"></div><span>Chargement des créneaux…</span>
            </div>
            <div v-else-if="!slots.length" style="text-align:center;padding:20px;color:#94a3b8;font-size:14px;">
              Aucun créneau disponible ce jour.
            </div>
            <div v-else class="slots-grid">
              <button
                v-for="slot in slots" :key="slot"
                :class="['slot-btn', selectedSlot === slot && 'selected-slot']"
                @click="selectedSlot = slot"
              >
                {{ slot }}
              </button>
            </div>

            <button
              v-if="selectedSlot"
              class="bk-btn-primary"
              style="margin-top:20px;"
              @click="goToConfirm"
            >
              Confirmer ce créneau
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </template>

        <!-- STEP 3 : Confirmation -->
        <template v-else-if="step === 'confirm'">
          <button class="bk-back-btn" @click="step = 'datetime'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            Retour
          </button>

          <div class="bk-section-title">Récapitulatif de votre rendez-vous</div>

          <div class="confirm-card">
            <div class="confirm-row">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              <div>
                <div class="confirm-label">Client</div>
                <div class="confirm-val">{{ clientName }} {{ clientLastName }}</div>
                <div class="confirm-sub">{{ clientPhone }}</div>
              </div>
            </div>
            <div class="confirm-row">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41"/></svg>
              <div style="flex:1;">
                <div class="confirm-label">Prestations</div>
                <div v-for="entry in selectedServices" :key="entry.id" class="confirm-svc-line">
                  <div class="confirm-val" style="font-size:13.5px;">{{ entry.name }}</div>
                  <div class="confirm-sub">
                    <span v-if="entry.price">{{ entry.price }} MAD</span>
                    <span v-if="entry.staffId"> · {{ staffList.find(s => s.id === entry.staffId)?.name }}</span>
                    <span v-else> · Sans préférence</span>
                  </div>
                </div>
                <div class="confirm-total" v-if="selectedServices.length > 1">Total : {{ totalPrice }} MAD · {{ totalDuration }} min</div>
              </div>
            </div>
            <div class="confirm-row">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <div>
                <div class="confirm-label">Date & heure</div>
                <div class="confirm-val">{{ formatDate(selectedDate) }} à {{ selectedSlot }}</div>
              </div>
            </div>
          </div>

          <div v-if="errorMsg" class="bk-error" style="margin-top:12px;">{{ errorMsg }}</div>

          <button class="bk-btn-primary" style="margin-top:20px;" :disabled="confirming" @click="confirmBooking">
            <svg v-if="!confirming" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <div v-else class="bk-spinner" style="width:16px;height:16px;border-color:#ffffff55;border-top-color:#fff;"></div>
            {{ confirming ? 'Réservation en cours…' : 'Confirmer le rendez-vous' }}
          </button>
        </template>
      </template>

      <!-- CONFIRMATION SUCCESS -->
      <div v-else class="bk-success">
        <div class="success-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 class="success-title">Rendez-vous confirmé !</h2>
        <p class="success-sub">Merci {{ clientName }}, votre rendez-vous a bien été enregistré.</p>

        <div class="success-details">
          <div class="confirm-row">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/></svg>
            <div>
              <div v-if="Array.isArray(confirmResult?.services)">
                <div v-for="s in confirmResult.services" :key="s">{{ s }}</div>
              </div>
              <span v-else>{{ confirmResult?.service }}</span>
            </div>
          </div>
          <div class="confirm-row">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>{{ formatDate(confirmResult?.date) }} à {{ confirmResult?.time }}</span>
          </div>
        </div>

        <button class="bk-btn-primary" style="margin-top:28px;" @click="router.push('/booking')">
          Prendre un autre rendez-vous
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.bk-layout {
  min-height: 100vh;
  background: var(--bg-main);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 24px 16px;
}
.bk-card {
  background: var(--bg-card); border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  padding: 32px 28px; width: 100%; max-width: 560px;
  border: 1px solid var(--border);
}
.bk-card.wide { max-width: 600px; }

.bk-loading { display: flex; align-items: center; gap: 12px; justify-content: center; color: var(--text-muted); font-size: 14px; }
.bk-spinner {
  width: 20px; height: 20px;
  border: 2px solid var(--border); border-top-color: var(--primary);
  border-radius: 50%; animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Org header */
.bk-org-header {
  display: flex; align-items: center; gap: 14px;
  padding-bottom: 20px; border-bottom: 1px solid var(--border); margin-bottom: 20px;
}
.bk-org-logo-sm { width: 44px; height: 44px; border-radius: 12px; overflow: hidden; background: var(--bg-soft); }
.bk-org-logo-sm img { width: 100%; height: 100%; object-fit: contain; }
.bk-org-avatar-sm {
  width: 44px; height: 44px; border-radius: 12px;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: #fff; font-size: 20px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.bk-org-name-lg { font-size: 16px; font-weight: 800; color: var(--text-main); }
.bk-client-tag { font-size: 12.5px; color: var(--text-muted); margin-top: 2px; }

/* Steps */
.bk-steps {
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 24px;
}
.bk-step {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 600; color: var(--text-light);
}
.bk-step.active { color: var(--primary); }
.bk-step.done { color: var(--green); }
.bk-step-num {
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--bg-soft); color: var(--text-light);
  font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.bk-step.active .bk-step-num { background: var(--primary); color: #fff; }
.bk-step.done .bk-step-num { background: var(--green); color: #fff; }
.bk-step-line { flex: 1; height: 2px; background: var(--border); border-radius: 1px; }

.bk-section-title {
  font-size: 11px; font-weight: 700; color: var(--text-light);
  text-transform: uppercase; letter-spacing: .07em;
  margin-bottom: 12px;
}

/* Services */
.svc-list { display: flex; flex-direction: column; gap: 8px; }
.svc-item {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 16px; border: 1px solid var(--border);
  border-radius: var(--radius-lg); background: var(--bg-card); cursor: pointer;
  text-align: left; width: 100%; transition: border-color .15s, box-shadow .15s;
}
.svc-item:hover { border-color: var(--primary); }
.svc-item.selected { border-color: var(--primary); background: var(--primary-soft); box-shadow: 0 0 0 3px var(--input-focus-ring); }
.svc-info { flex: 1; }
.svc-name { font-size: 14px; font-weight: 700; color: var(--text-main); }
.svc-duration { font-size: 12px; color: var(--text-light); margin-top: 2px; }
.svc-price { font-size: 14px; font-weight: 700; color: var(--primary); }
.svc-check {
  width: 22px; height: 22px; background: var(--primary); border-radius: 50%;
  display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0;
}
.svc-add-icon {
  width: 22px; height: 22px; border: 1.5px solid var(--border-strong); border-radius: 50%;
  display: flex; align-items: center; justify-content: center; color: var(--text-light); flex-shrink: 0;
}
.svc-item:hover .svc-add-icon { border-color: var(--primary); color: var(--primary); }

/* Basket */
.basket {
  margin-top: 16px; border: 1px solid rgba(21,128,61,.25);
  border-radius: var(--radius-lg); overflow: hidden; background: var(--green-soft);
}
.basket-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid rgba(21,128,61,.2);
}
.basket-title { font-size: 12px; font-weight: 700; color: var(--green); text-transform: uppercase; letter-spacing: .04em; }
.basket-total { font-size: 12.5px; font-weight: 700; color: var(--primary); }
.basket-items { display: flex; flex-direction: column; }
.basket-item-block { border-bottom: 1px solid rgba(21,128,61,.15); padding: 10px 14px; }
.basket-item-block:last-child { border-bottom: none; }
.basket-item {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 8px;
}
.basket-item-name { flex: 1; font-size: 13.5px; font-weight: 600; color: var(--text-main); }
.basket-item-price { font-size: 13px; font-weight: 700; color: var(--primary); }
.basket-remove {
  background: transparent; border: none; cursor: pointer;
  color: var(--text-light); padding: 3px; display: flex; align-items: center;
  border-radius: 4px; transition: color .12s;
}
.basket-remove:hover { color: var(--red); }

/* Staff chips per service */
.staff-chips {
  display: flex; flex-wrap: wrap; gap: 6px;
}
.staff-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px 4px 4px;
  border: 1px solid var(--border); border-radius: 20px;
  background: var(--bg-card); cursor: pointer; font-size: 12px; font-weight: 600; color: var(--text-muted);
  transition: border-color .12s, background .12s;
}
.staff-chip:hover { border-color: var(--primary); color: var(--primary); }
.staff-chip.active { border-color: var(--primary); background: var(--primary-soft); color: var(--primary); }
.chip-avatar {
  width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: #fff; font-size: 10px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.chip-any { background: var(--bg-soft); color: var(--text-muted); }


/* Calendar */
.bk-back-btn {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12.5px; font-weight: 600; color: var(--primary);
  background: none; border: none; cursor: pointer; padding: 0; margin-bottom: 16px;
}
.bk-recap-bar {
  background: var(--bg-soft); border: 1px solid var(--border);
  border-radius: 10px; padding: 10px 14px;
  font-size: 13px; font-weight: 600; color: var(--text-muted);
  margin-bottom: 20px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.recap-svc { flex: 1; }
.recap-staff { color: var(--text-light); font-weight: 400; }
.recap-total { color: var(--primary); font-weight: 700; margin-left: auto; }

.cal-wrap { border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
.cal-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid var(--border);
}
.cal-nav-btn {
  width: 32px; height: 32px; border: 1px solid var(--border);
  border-radius: 8px; background: var(--bg-card); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.cal-nav-btn:hover { background: var(--bg-soft); }
.cal-month-label { font-size: 14px; font-weight: 700; color: var(--text-main); text-transform: capitalize; }

.cal-grid {
  display: grid; grid-template-columns: repeat(7, 1fr);
  gap: 2px; padding: 12px;
}
.cal-day-label {
  text-align: center; font-size: 11px; font-weight: 700;
  color: var(--text-light); padding: 4px 0; text-transform: uppercase;
}
.cal-day {
  aspect-ratio: 1; border: none; background: transparent;
  border-radius: 8px; font-size: 13px; color: var(--text-light);
  cursor: default; display: flex; align-items: center; justify-content: center;
  font-weight: 500;
}
.cal-day.empty { background: transparent; }
.cal-day.past { color: var(--border-strong); }
.cal-day.today { color: var(--primary); font-weight: 700; }
.cal-day.available {
  color: var(--text-main); cursor: pointer; font-weight: 600;
  background: var(--primary-soft);
}
.cal-day.available:hover { background: var(--primary-mid); }
.cal-day.selected-day { background: var(--primary) !important; color: #fff !important; }

/* Slots */
.slots-section { margin-top: 20px; }
.slots-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.slot-btn {
  padding: 9px 18px; border: 1px solid var(--border);
  border-radius: 10px; background: var(--bg-card); font-size: 13.5px;
  font-weight: 700; color: var(--text-main); cursor: pointer;
  transition: border-color .12s;
}
.slot-btn:hover { border-color: var(--primary); color: var(--primary); }
.slot-btn.selected-slot { background: var(--primary); color: #fff; border-color: var(--primary); }

/* Confirm card */
.confirm-card {
  border: 1px solid var(--border); border-radius: var(--radius-lg);
  padding: 4px 0; overflow: hidden;
}
.confirm-row {
  display: flex; align-items: flex-start; gap: 14px;
  padding: 14px 18px; border-bottom: 1px solid var(--border);
  font-size: 13.5px; color: var(--text-muted);
}
.confirm-row:last-child { border-bottom: none; }
.confirm-row svg { flex-shrink: 0; margin-top: 2px; }
.confirm-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-light); margin-bottom: 3px; }
.confirm-val { font-size: 14px; font-weight: 700; color: var(--text-main); }
.confirm-sub { font-size: 12px; color: var(--text-light); margin-top: 1px; }
.confirm-svc-line { margin-bottom: 4px; }
.confirm-total { margin-top: 6px; font-size: 12px; font-weight: 700; color: var(--primary); }

/* Success */
.bk-success { text-align: center; padding: 20px 0; }
.success-icon {
  width: 72px; height: 72px; border-radius: 50%;
  background: var(--green-soft); border: 2px solid rgba(21,128,61,.25);
  color: var(--green); display: flex; align-items: center; justify-content: center;
  margin: 0 auto 20px;
}
.success-title { font-size: 22px; font-weight: 800; color: var(--text-main); margin: 0 0 8px; }
.success-sub { font-size: 14px; color: var(--text-muted); margin: 0 0 24px; }
.success-details { text-align: left; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-bottom: 4px; }
.success-details .confirm-row { font-size: 14px; color: var(--text-main); font-weight: 600; }

/* Shared */
.bk-btn-primary {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--primary);
  color: #fff; border: none; border-radius: var(--radius-lg);
  padding: 13px 20px; font-size: 14.5px; font-weight: 700;
  cursor: pointer; transition: background .15s, transform .1s, box-shadow .15s;
  width: 100%; box-shadow: 0 0 18px var(--primary-glow);
}
.bk-btn-primary:hover { background: var(--primary-light); transform: translateY(-1px); }
.bk-btn-primary:disabled { opacity: .5; cursor: not-allowed; transform: none; }

.bk-error {
  background: var(--red-soft); border: 1px solid rgba(220,38,38,.25);
  color: var(--red); font-size: 13px; padding: 10px 13px; border-radius: 8px;
}

/* Catégories */
.cat-list { display: flex; flex-direction: column; gap: 8px; }
.cat-group { border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
.cat-header {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 13px 16px;
  background: var(--bg-card); border: none; cursor: pointer;
  text-align: left; transition: background .15s;
  border-left: 4px solid var(--cat-color, #94a3b8);
}
.cat-header:hover { background: var(--bg-soft); }
.cat-header.cat-open { background: var(--bg-soft); }
.cat-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.cat-name { flex: 1; font-size: 14px; font-weight: 700; color: var(--text-main); }
.cat-count { font-size: 11.5px; color: var(--text-light); font-weight: 500; }
.cat-chevron { flex-shrink: 0; color: #94a3b8; transition: transform .2s; }
.cat-chevron.open { transform: rotate(180deg); }
.cat-body {
  padding: 8px 12px 12px;
  border-top: 1px solid #f1f5f9;
  background: #fafafa;
}
.cat-body .svc-item { background: #fff; }
</style>
