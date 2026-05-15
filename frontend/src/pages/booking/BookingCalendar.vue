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

const selectedService = ref(null)
const selectedStaff = ref(null) // null = pas de préférence
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

// ── calendar ───────────────────────────────────────────────────────────────
const DAY_LABELS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']

const calendarDays = computed(() => {
  const [y, m] = calendarMonth.value.split('-').map(Number)
  const firstDay = new Date(y, m - 1, 1)
  const lastDay = new Date(y, m, 0)
  // Monday-first: 0=Mon…6=Sun
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
  if (!selectedService.value) return
  availableDays.value = []
  const staffParam = selectedStaff.value ? `&staffId=${selectedStaff.value.id}` : ''
  const res = await fetch(`${API}/booking/${orgId}/available-days?month=${calendarMonth.value}&serviceId=${selectedService.value.id}${staffParam}`)
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
  const staffParam = selectedStaff.value ? `&staffId=${selectedStaff.value.id}` : ''
  const res = await fetch(`${API}/booking/${orgId}/slots?date=${d}&serviceId=${selectedService.value.id}${staffParam}`)
  const data = await res.json()
  slots.value = data.slots || []
  slotsLoading.value = false
}

// ── flow ───────────────────────────────────────────────────────────────────
async function goToDatetime() {
  if (!selectedService.value) return
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
        serviceId: selectedService.value.id,
        staffId: selectedStaff.value?.id || null
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

// Filtered staff: only those competent for selected service
const filteredStaff = computed(() => {
  if (!selectedService.value) return staffList.value
  const catId = selectedService.value.category_id
  if (!catId) return staffList.value
  return staffList.value.filter(s =>
    s.staff_categories?.some(sc => sc.category_id === catId)
  )
})
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

        <!-- STEP 1 : Service -->
        <template v-if="step === 'service'">
          <div class="bk-section-title">Choisissez une prestation</div>

          <div class="svc-list">
            <button
              v-for="s in services" :key="s.id"
              :class="['svc-item', selectedService?.id === s.id && 'selected']"
              @click="selectedService = s"
            >
              <div class="svc-info">
                <div class="svc-name">{{ s.name }}</div>
                <div class="svc-duration" v-if="s.duration_minutes">{{ s.duration_minutes }} min</div>
              </div>
              <div class="svc-price" v-if="s.price">{{ s.price }} MAD</div>
              <div class="svc-check" v-if="selectedService?.id === s.id">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            </button>
          </div>

          <!-- Staff preference -->
          <div v-if="selectedService" class="bk-section-title" style="margin-top:20px;">
            Préférence collaborateur
            <span style="font-weight:400;color:#94a3b8;font-size:11px;"> (optionnel)</span>
          </div>
          <div v-if="selectedService" class="staff-list">
            <button
              :class="['staff-item', selectedStaff === null && 'selected']"
              @click="selectedStaff = null"
            >
              <div class="staff-avatar" style="background:#e2e8f0;color:#64748b;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              </div>
              <span class="staff-name">Pas de préférence</span>
              <div class="staff-check" v-if="selectedStaff === null">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            </button>
            <button
              v-for="s in filteredStaff" :key="s.id"
              :class="['staff-item', selectedStaff?.id === s.id && 'selected']"
              @click="selectedStaff = s"
            >
              <div class="staff-avatar">
                <img v-if="s.avatar_url" :src="s.avatar_url" :alt="s.name" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />
                <span v-else>{{ s.name.charAt(0) }}</span>
              </div>
              <span class="staff-name">{{ s.name }}</span>
              <div class="staff-check" v-if="selectedStaff?.id === s.id">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            </button>
          </div>

          <button class="bk-btn-primary" :disabled="!selectedService" @click="goToDatetime" style="margin-top:24px;">
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
            <span class="recap-svc">{{ selectedService.name }}</span>
            <span v-if="selectedStaff" class="recap-staff">· {{ selectedStaff.name }}</span>
            <span v-else class="recap-staff">· Sans préférence</span>
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
              <div>
                <div class="confirm-label">Prestation</div>
                <div class="confirm-val">{{ selectedService.name }}</div>
                <div class="confirm-sub" v-if="selectedService.price">{{ selectedService.price }} MAD</div>
              </div>
            </div>
            <div class="confirm-row">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <div>
                <div class="confirm-label">Date & heure</div>
                <div class="confirm-val">{{ formatDate(selectedDate) }} à {{ selectedSlot }}</div>
              </div>
            </div>
            <div v-if="selectedStaff" class="confirm-row">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <div>
                <div class="confirm-label">Collaborateur</div>
                <div class="confirm-val">{{ selectedStaff.name }}</div>
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
            <span>{{ confirmResult?.service }}</span>
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
  background: linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 24px 16px;
}
.bk-card {
  background: #fff; border-radius: 20px;
  box-shadow: 0 8px 40px rgba(0,0,0,.10);
  padding: 32px 28px; width: 100%; max-width: 560px;
}
.bk-card.wide { max-width: 600px; }

.bk-loading { display: flex; align-items: center; gap: 12px; justify-content: center; color: #64748b; font-size: 14px; }
.bk-spinner {
  width: 20px; height: 20px;
  border: 2px solid #e2e8f0; border-top-color: #6366f1;
  border-radius: 50%; animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Org header */
.bk-org-header {
  display: flex; align-items: center; gap: 14px;
  padding-bottom: 20px; border-bottom: 1px solid #f1f5f9; margin-bottom: 20px;
}
.bk-org-logo-sm { width: 44px; height: 44px; border-radius: 12px; overflow: hidden; background: #f1f5f9; }
.bk-org-logo-sm img { width: 100%; height: 100%; object-fit: contain; }
.bk-org-avatar-sm {
  width: 44px; height: 44px; border-radius: 12px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff; font-size: 20px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.bk-org-name-lg { font-size: 16px; font-weight: 800; color: #1e293b; }
.bk-client-tag { font-size: 12.5px; color: #64748b; margin-top: 2px; }

/* Steps */
.bk-steps {
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 24px;
}
.bk-step {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 600; color: #94a3b8;
}
.bk-step.active { color: #6366f1; }
.bk-step.done { color: #10b981; }
.bk-step-num {
  width: 22px; height: 22px; border-radius: 50%;
  background: #f1f5f9; color: #94a3b8;
  font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.bk-step.active .bk-step-num { background: #6366f1; color: #fff; }
.bk-step.done .bk-step-num { background: #10b981; color: #fff; }
.bk-step-line { flex: 1; height: 2px; background: #e2e8f0; border-radius: 1px; }

.bk-section-title {
  font-size: 13px; font-weight: 700; color: #475569;
  text-transform: uppercase; letter-spacing: .05em;
  margin-bottom: 12px;
}

/* Services */
.svc-list { display: flex; flex-direction: column; gap: 8px; }
.svc-item {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 16px; border: 1.5px solid #e2e8f0;
  border-radius: 12px; background: #fff; cursor: pointer;
  text-align: left; width: 100%; transition: border-color .15s, box-shadow .15s;
}
.svc-item:hover { border-color: #6366f1; }
.svc-item.selected { border-color: #6366f1; background: #f5f3ff; box-shadow: 0 0 0 3px #6366f120; }
.svc-info { flex: 1; }
.svc-name { font-size: 14px; font-weight: 700; color: #1e293b; }
.svc-duration { font-size: 12px; color: #94a3b8; margin-top: 2px; }
.svc-price { font-size: 14px; font-weight: 700; color: #6366f1; }
.svc-check { width: 22px; height: 22px; background: #6366f1; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }

/* Staff */
.staff-list { display: flex; flex-wrap: wrap; gap: 8px; }
.staff-item {
  display: flex; align-items: center; gap: 9px;
  padding: 9px 14px; border: 1.5px solid #e2e8f0;
  border-radius: 10px; background: #fff; cursor: pointer;
  transition: border-color .15s; position: relative;
}
.staff-item:hover { border-color: #6366f1; }
.staff-item.selected { border-color: #6366f1; background: #f5f3ff; }
.staff-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff; font-size: 13px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  overflow: hidden;
}
.staff-name { font-size: 13px; font-weight: 600; color: #1e293b; }
.staff-check {
  width: 18px; height: 18px; background: #6366f1; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; color: #fff;
}

/* Calendar */
.bk-back-btn {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12.5px; font-weight: 600; color: #6366f1;
  background: none; border: none; cursor: pointer; padding: 0; margin-bottom: 16px;
}
.bk-recap-bar {
  background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 10px; padding: 10px 14px;
  font-size: 13px; font-weight: 600; color: #475569;
  margin-bottom: 20px;
}
.recap-staff { color: #94a3b8; font-weight: 400; }

.cal-wrap { border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; }
.cal-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid #f1f5f9;
}
.cal-nav-btn {
  width: 32px; height: 32px; border: 1px solid #e2e8f0;
  border-radius: 8px; background: #fff; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.cal-nav-btn:hover { background: #f8fafc; }
.cal-month-label { font-size: 14px; font-weight: 700; color: #1e293b; text-transform: capitalize; }

.cal-grid {
  display: grid; grid-template-columns: repeat(7, 1fr);
  gap: 2px; padding: 12px;
}
.cal-day-label {
  text-align: center; font-size: 11px; font-weight: 700;
  color: #94a3b8; padding: 4px 0; text-transform: uppercase;
}
.cal-day {
  aspect-ratio: 1; border: none; background: transparent;
  border-radius: 8px; font-size: 13px; color: #94a3b8;
  cursor: default; display: flex; align-items: center; justify-content: center;
  font-weight: 500;
}
.cal-day.empty { background: transparent; }
.cal-day.past { color: #e2e8f0; }
.cal-day.today { color: #6366f1; font-weight: 700; }
.cal-day.available {
  color: #1e293b; cursor: pointer; font-weight: 600;
  background: #f0f4ff;
}
.cal-day.available:hover { background: #e0e7ff; }
.cal-day.selected-day { background: #6366f1 !important; color: #fff !important; }

/* Slots */
.slots-section { margin-top: 20px; }
.slots-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.slot-btn {
  padding: 9px 18px; border: 1.5px solid #e2e8f0;
  border-radius: 10px; background: #fff; font-size: 13.5px;
  font-weight: 700; color: #1e293b; cursor: pointer;
  transition: border-color .12s;
}
.slot-btn:hover { border-color: #6366f1; color: #6366f1; }
.slot-btn.selected-slot { background: #6366f1; color: #fff; border-color: #6366f1; }

/* Confirm card */
.confirm-card {
  border: 1.5px solid #e2e8f0; border-radius: 14px;
  padding: 4px 0; overflow: hidden;
}
.confirm-row {
  display: flex; align-items: flex-start; gap: 14px;
  padding: 14px 18px; border-bottom: 1px solid #f1f5f9;
  font-size: 13.5px; color: #64748b;
}
.confirm-row:last-child { border-bottom: none; }
.confirm-row svg { flex-shrink: 0; margin-top: 2px; }
.confirm-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; margin-bottom: 3px; }
.confirm-val { font-size: 14px; font-weight: 700; color: #1e293b; }
.confirm-sub { font-size: 12px; color: #94a3b8; margin-top: 1px; }

/* Success */
.bk-success { text-align: center; padding: 20px 0; }
.success-icon {
  width: 72px; height: 72px; border-radius: 50%;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff; display: flex; align-items: center; justify-content: center;
  margin: 0 auto 20px;
}
.success-title { font-size: 22px; font-weight: 800; color: #1e293b; margin: 0 0 8px; }
.success-sub { font-size: 14px; color: #64748b; margin: 0 0 24px; }
.success-details { text-align: left; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 4px; }
.success-details .confirm-row { font-size: 14px; color: #1e293b; font-weight: 600; }

/* Shared */
.bk-btn-primary {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff; border: none; border-radius: 12px;
  padding: 13px 20px; font-size: 14.5px; font-weight: 700;
  cursor: pointer; transition: opacity .15s; width: 100%;
}
.bk-btn-primary:hover { opacity: .9; }
.bk-btn-primary:disabled { opacity: .5; cursor: not-allowed; }

.bk-error {
  background: #fef2f2; border: 1px solid #fca5a5;
  color: #dc2626; font-size: 13px; padding: 10px 13px; border-radius: 8px;
}
</style>
