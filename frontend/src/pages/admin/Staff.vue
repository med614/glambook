<script setup>
import { ref, onMounted, computed } from 'vue'
import StaffAbsenceModal from '@/components/staff/StaffAbsenceModal.vue'
import StaffModal from '@/components/staff/StaffModal.vue'
import { fetchServiceCategories } from '@/services/services.service'
import { fetchStaff, toggleStaff, deleteStaff } from '@/services/staff.service'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import DropdownActions from '@/components/common/DropdownActions.vue'
import { supabase } from '@/lib/supabase'

const planningMode = ref(false)
const showStaffPicker = ref(false)
const planningSubView = ref('list') // 'list' | 'calendar'
const planningMonth = ref(new Date().toLocaleDateString('en-CA').slice(0, 7)) // 'YYYY-MM'

const STAFF_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#ec4899','#8b5cf6','#14b8a6']

function staffColor(idx) {
  return STAFF_COLORS[idx % STAFF_COLORS.length]
}

const allAbsences = computed(() => {
  const rows = []
  staffList.value.forEach((s, idx) => {
    const color = staffColor(idx)
    for (const a of (s.absences || [])) {
      rows.push({ ...a, staffName: s.name, color })
    }
  })
  return rows.sort((a, b) => a.start_date.localeCompare(b.start_date))
})

const planningMonthAbsences = computed(() => {
  const [y, m] = planningMonth.value.split('-').map(Number)
  const monthStart = `${planningMonth.value}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const monthEnd = `${planningMonth.value}-${String(lastDay).padStart(2,'0')}`
  return allAbsences.value.filter(a => a.start_date <= monthEnd && a.end_date >= monthStart)
})

const calendarDays = computed(() => {
  const [y, m] = planningMonth.value.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return Array.from({ length: lastDay }, (_, i) => {
    const d = String(i + 1).padStart(2, '0')
    return `${planningMonth.value}-${d}`
  })
})

function isAbsentOnDay(absence, day) {
  return absence.start_date <= day && absence.end_date >= day
}

function prevMonth() {
  const [y, m] = planningMonth.value.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  planningMonth.value = d.toLocaleDateString('en-CA').slice(0, 7)
}
function nextMonth() {
  const [y, m] = planningMonth.value.split('-').map(Number)
  const d = new Date(y, m, 1)
  planningMonth.value = d.toLocaleDateString('en-CA').slice(0, 7)
}
function monthLabel() {
  const [y, m] = planningMonth.value.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

const showStaffModal = ref(false)
const categories = ref([])
const showAbsenceModal = ref(false)
const selectedStaff = ref(null)
const staffList = ref([])
const loading = ref(false)
const showConfirmModal = ref(false)
const staffToDelete = ref(null)
const externalRdvsByStaff = ref({})

const PERIOD_LABELS = { morning: 'Matin', afternoon: 'Après-midi', evening: 'Soir' }

async function loadExternalRdvs() {
  const today = new Date().toLocaleDateString('en-CA')
  const { data } = await supabase
    .from('appointments')
    .select('id, start_time, external_period, appointment_services(staff_id)')
    .eq('is_external', true)
    .neq('status', 'cancelled')
    .gte('start_time', today + 'T00:00:00')
  if (!data) return
  const map = {}
  for (const a of data) {
    const date = (a.start_time || '').slice(0, 10)
    const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    const period = a.external_period ? PERIOD_LABELS[a.external_period] : null
    const label = `Externe le ${dateLabel}${period ? ' – ' + period : ''}`
    for (const s of (a.appointment_services || [])) {
      if (!s.staff_id) continue
      if (!map[s.staff_id]) map[s.staff_id] = []
      map[s.staff_id].push({ id: a.id, label, isToday: date === today })
    }
  }
  externalRdvsByStaff.value = map
}

async function load() {
  loading.value = true
  try {
    const [staffData, catsData] = await Promise.all([fetchStaff(), fetchServiceCategories()])
    staffList.value = staffData
    categories.value = catsData
    await loadExternalRdvs()
  } catch (err) {
    console.error('Error loading staff:', err)
  } finally {
    loading.value = false
  }
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

function getUpcomingAbsences(absences) {
  if (!absences?.length) return []
  const today = new Date().toLocaleDateString('en-CA')
  return absences.filter(a => a.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date))
}

function formatAbsenceRange(a) {
  const start = new Date(a.start_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const end = new Date(a.end_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  return start === end ? start : `${start} → ${end}`
}

function isTodayAbsent(a) {
  const today = new Date().toLocaleDateString('en-CA')
  return a.start_date <= today && a.end_date >= today
}

function openAbsence(staff) {
  selectedStaff.value = staff
  showAbsenceModal.value = true
}

function editStaff(staff) {
  selectedStaff.value = staff
  showStaffModal.value = true
}

async function onToggle(staff) {
  try {
    await toggleStaff(staff.id, !staff.is_active)
    await load()
  } catch (err) {
    console.error('Error toggling staff:', err)
  }
}

function onDelete(staff) {
  staffToDelete.value = staff
  showConfirmModal.value = true
}

async function confirmDelete() {
  if (!staffToDelete.value) return
  try {
    await deleteStaff(staffToDelete.value.id)
    showConfirmModal.value = false
    staffToDelete.value = null
    await load()
  } catch {
    alert("Impossible de supprimer ce membre. Il est lié à des rendez-vous existants.")
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ planningMode ? 'Planning des absences' : 'Équipe' }}</h1>
        <p class="page-desc">{{ planningMode ? monthLabel() : `${staffList.length} membre${staffList.length !== 1 ? 's' : ''} dans l'équipe` }}</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <!-- View toggle -->
        <div class="view-toggle">
          <button :class="['view-toggle-btn', !planningMode && 'active']" @click="planningMode = false" title="Vue équipe">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Équipe
          </button>
          <button :class="['view-toggle-btn', planningMode && 'active']" @click="planningMode = true" title="Planning absences">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Planning
          </button>
        </div>

        <template v-if="!planningMode">
          <button class="btn btn-primary" @click="() => { selectedStaff = null; showStaffModal = true }">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Ajouter un membre
          </button>
        </template>

        <template v-else>
          <div style="position:relative;">
            <button class="btn btn-primary" @click="showStaffPicker = !showStaffPicker">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Ajouter une absence
            </button>
            <div v-if="showStaffPicker" class="staff-picker-dropdown">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);padding:8px 12px 4px;">Choisir un collaborateur</div>
              <button
                v-for="s in staffList" :key="s.id"
                class="staff-picker-item"
                @click="() => { selectedStaff = s; showAbsenceModal = true; showStaffPicker = false }"
              >
                <span style="font-weight:600;">{{ s.name }}</span>
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Planning Mode -->
    <template v-if="planningMode">
      <!-- Planning sub-toolbar -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
        <!-- Month nav -->
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="btn btn-secondary" style="padding:6px 10px;" @click="prevMonth">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span style="font-size:13.5px;font-weight:600;min-width:130px;text-align:center;">{{ monthLabel() }}</span>
          <button class="btn btn-secondary" style="padding:6px 10px;" @click="nextMonth">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <!-- List/Calendar toggle -->
        <div class="view-toggle" style="margin-left:auto;">
          <button :class="['view-toggle-btn', planningSubView==='list' && 'active']" @click="planningSubView='list'">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            Liste
          </button>
          <button :class="['view-toggle-btn', planningSubView==='calendar' && 'active']" @click="planningSubView='calendar'">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Calendrier
          </button>
        </div>
      </div>

      <!-- LIST VIEW -->
      <div v-if="planningSubView==='list'" class="data-card">
        <div v-if="loading" class="empty-state">
          <div class="page-spinner"></div><p>Chargement…</p>
        </div>
        <table v-else-if="planningMonthAbsences.length" class="table">
          <thead>
            <tr>
              <th>Collaborateur</th>
              <th>Début</th>
              <th>Fin</th>
              <th>Durée</th>
              <th>Statut</th>
              <th style="width:48px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in planningMonthAbsences" :key="a.id">
              <td>
                <div style="display:flex;align-items:center;gap:10px;">
                  <span class="staff-dot" :style="{ background: a.color }"></span>
                  <span style="font-weight:600;">{{ a.staffName }}</span>
                </div>
              </td>
              <td style="font-size:13px;">{{ new Date(a.start_date + 'T12:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short' }) }}</td>
              <td style="font-size:13px;">{{ new Date(a.end_date + 'T12:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short' }) }}</td>
              <td>
                <span style="font-size:13px;color:var(--text-muted);">
                  {{ Math.round((new Date(a.end_date) - new Date(a.start_date)) / 86400000) + 1 }} jour{{ Math.round((new Date(a.end_date) - new Date(a.start_date)) / 86400000) > 0 ? 's' : '' }}
                </span>
              </td>
              <td>
                <span v-if="a.start_date <= new Date().toLocaleDateString('en-CA') && a.end_date >= new Date().toLocaleDateString('en-CA')" style="font-size:11px;font-weight:700;text-transform:uppercase;padding:3px 8px;border-radius:6px;background:var(--green-soft);color:var(--green);">En cours</span>
                <span v-else style="font-size:11px;font-weight:700;text-transform:uppercase;padding:3px 8px;border-radius:6px;background:var(--bg-soft);color:var(--text-muted);">À venir</span>
              </td>
              <td>
                <button class="icon-btn" @click="() => { selectedStaff = staffList.find(s => s.absences?.some(ab => ab.id === a.id)); showAbsenceModal = true }" title="Gérer">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty-state">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-light)"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <p>Aucune absence ce mois-ci.</p>
        </div>
      </div>

      <!-- CALENDAR VIEW -->
      <div v-else class="data-card" style="overflow-x:auto;">
        <div v-if="loading" class="empty-state">
          <div class="page-spinner"></div><p>Chargement…</p>
        </div>
        <div v-else-if="staffList.length" class="cal-grid" :style="{ '--days': calendarDays.length }">
          <!-- Day headers -->
          <div class="cal-name-col"></div>
          <div
            v-for="day in calendarDays" :key="day"
            class="cal-day-header"
            :class="{ 'cal-day-today': day === new Date().toLocaleDateString('en-CA') }"
          >
            {{ parseInt(day.slice(-2)) }}
          </div>

          <!-- Staff rows -->
          <template v-for="(s, idx) in staffList" :key="s.id">
            <div class="cal-name-col">
              <span class="staff-dot" :style="{ background: staffColor(idx) }"></span>
              <span style="font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px;">{{ s.name }}</span>
            </div>
            <div
              v-for="day in calendarDays" :key="day"
              class="cal-cell"
              :class="{ 'cal-cell-today': day === new Date().toLocaleDateString('en-CA') }"
            >
              <span
                v-if="s.absences?.some(a => isAbsentOnDay(a, day))"
                class="cal-absent-bar"
                :style="{ background: staffColor(idx) }"
              ></span>
            </div>
          </template>
        </div>
        <div v-else class="empty-state"><p>Aucun collaborateur.</p></div>
      </div>
    </template><!-- end planningMode template -->

    <!-- Team Table (default) -->
    <div v-if="!planningMode" class="data-card">
      <div v-if="loading" class="empty-state">
        <div class="page-spinner"></div>
        <p>Chargement…</p>
      </div>

      <table v-else-if="staffList.length" class="table">
        <thead>
          <tr>
            <th style="width:48px;"></th>
            <th>Nom</th>
            <th>Compétences</th>
            <th>Intégration</th>
            <th>Statut</th>
            <th>Absences</th>
            <th style="width:56px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in staffList" :key="s.id">
            <td>
              <div class="avatar">
                <img v-if="s.avatar_url" :src="s.avatar_url" :alt="s.name" style="width:100%;height:100%;object-fit:cover;" />
                <svg v-else viewBox="0 0 64 64" width="46" height="46" xmlns="http://www.w3.org/2000/svg">
                  <rect width="64" height="64" fill="#e2e8f0"/>
                  <circle cx="32" cy="25" r="13" fill="#94a3b8"/>
                  <ellipse cx="32" cy="55" rx="20" ry="14" fill="#94a3b8"/>
                </svg>
              </div>
            </td>
            <td>
              <span style="font-weight:600;">{{ s.name }}</span>
            </td>
            <td>
              <div style="display:flex;flex-wrap:wrap;gap:5px;">
                <span v-for="cat in s.categories" :key="cat.id" class="skill-badge" :style="{ background: cat.color + '22', color: cat.color, borderColor: cat.color + '55' }">{{ cat.name }}</span>
                <span v-if="!s.categories?.length" style="color:var(--text-light);font-size:13px;">—</span>
              </div>
            </td>
            <td>
              <span v-if="s.join_date" style="font-size:13px;color:var(--text-muted);">
                {{ new Date(s.join_date).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' }) }}
              </span>
              <span v-else style="color:var(--text-light);font-size:13px;">—</span>
            </td>
            <td>
              <div style="display:flex;align-items:center;gap:10px;">
                <label class="toggle" @click.stop>
                  <input type="checkbox" :checked="s.is_active" @change="onToggle(s)" />
                  <span class="toggle-switch"></span>
                </label>
                <span :class="s.is_active ? 'badge badge-green' : 'badge badge-gray'">
                  {{ s.is_active ? 'Actif' : 'Suspendu' }}
                </span>
              </div>
            </td>
            <td>
              <div v-if="!getUpcomingAbsences(s.absences).length && !externalRdvsByStaff[s.id]?.length" style="display:flex;align-items:center;gap:6px;color:var(--green);font-size:12.5px;font-weight:600;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Disponible
              </div>
              <div v-else style="display:flex;flex-wrap:wrap;gap:4px;">
                <span
                  v-for="a in getUpcomingAbsences(s.absences)"
                  :key="a.id"
                  :class="isTodayAbsent(a) ? 'badge badge-red' : 'badge badge-orange'"
                >{{ formatAbsenceRange(a) }}</span>
                <span
                  v-for="ext in (externalRdvsByStaff[s.id] || [])"
                  :key="'ext-' + ext.id"
                  :class="ext.isToday ? 'badge badge-red' : 'badge badge-blue'"
                >{{ ext.label }}</span>
              </div>
            </td>
            <td>
              <DropdownActions
                :actions="[
                  { label: 'Modifier', icon: 'edit', onClick: () => editStaff(s) },
                  { label: 'Absences', icon: 'calendar', onClick: () => openAbsence(s) },
                  { label: s.is_active ? 'Suspendre' : 'Réactiver', icon: s.is_active ? 'pause' : 'play', onClick: () => onToggle(s) },
                  { label: 'Supprimer', icon: 'trash', onClick: () => onDelete(s), class: 'danger' }
                ]"
              />
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else-if="!loading" class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-light)">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
        <p>Aucun membre d'équipe trouvé.</p>
      </div>
    </div>

    <StaffAbsenceModal :open="showAbsenceModal" :staff="selectedStaff" @close="showAbsenceModal = false" @updated="load" />
    <StaffModal v-if="showStaffModal" :open="showStaffModal" :staff="selectedStaff" :categories="categories" @close="showStaffModal = false" @saved="load" />
    <ConfirmModal
      :open="showConfirmModal"
      title="Supprimer le membre"
      :message="`Êtes-vous sûr de vouloir supprimer ${staffToDelete?.name} ? Cette action est irréversible.`"
      confirmText="Supprimer"
      @close="showConfirmModal = false"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.skill-badge {
  display: inline-block;
  background: var(--primary-soft);
  color: var(--primary-text);
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}

.page-spinner {
  width: 24px;
  height: 24px;
  border: 2.5px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* View toggle */
.view-toggle {
  display: flex;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.view-toggle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 13px;
  background: transparent;
  border: none;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  transition: background .15s, color .15s;
}
.view-toggle-btn.active {
  background: var(--bg-card);
  color: var(--text-main);
  box-shadow: 0 1px 3px rgba(0,0,0,.07);
}

/* Staff dot */
.staff-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}

/* Icon btn */
.icon-btn {
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: var(--text-light);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-btn:hover { background: var(--bg-soft); color: var(--text-muted); }

/* Calendar grid */
.cal-grid {
  display: grid;
  grid-template-columns: 130px repeat(var(--days), minmax(28px, 1fr));
  gap: 0;
  min-width: 600px;
}
.cal-name-col {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-soft);
  position: sticky;
  left: 0;
  z-index: 1;
  font-size: 12.5px;
}
.cal-day-header {
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  padding: 8px 2px;
  border-bottom: 1px solid var(--border);
  border-left: 1px solid var(--border);
}
.cal-day-header.cal-day-today {
  color: var(--primary);
  background: var(--primary-soft);
}
.cal-cell {
  height: 32px;
  border-bottom: 1px solid var(--border);
  border-left: 1px solid var(--border);
  position: relative;
}
.cal-cell.cal-cell-today {
  background: var(--primary-soft);
}
.cal-absent-bar {
  position: absolute;
  inset: 5px 2px;
  border-radius: 3px;
  opacity: .75;
}

/* Staff picker dropdown */
.staff-picker-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,.12);
  min-width: 180px;
  z-index: 100;
  padding: 4px 0;
  overflow: hidden;
}
.staff-picker-item {
  display: flex;
  width: 100%;
  padding: 9px 14px;
  background: none;
  border: none;
  font-size: 13px;
  color: var(--text-main);
  cursor: pointer;
  text-align: left;
}
.staff-picker-item:hover { background: var(--bg-soft); }

@media (max-width: 768px) {
  .table thead th:nth-child(3),
  .table tbody td:nth-child(3),
  .table thead th:nth-child(4),
  .table tbody td:nth-child(4),
  .table thead th:nth-child(6),
  .table tbody td:nth-child(6) { display: none; }
}
</style>
