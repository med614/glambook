<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { getOrgId } from '@/composables/useOrgId'

const props = defineProps({
  staff: { type: Array, default: () => [] }
})

const emit = defineEmits(['open-rdv'])

const viewMode  = ref('week')
const refDate   = ref(new Date())
const appts     = ref([])
const isLoading = ref(false)

// ── Fetch ──────────────────────────────────────────────────────────────────
async function fetchRange(from, to) {
  isLoading.value = true
  try {
    const orgId = await getOrgId()
    const { data, error } = await supabase
      .from('appointments')
      .select(`id, start_time, status, type, is_external,
        client:clients(id, name, last_name, phone),
        appointment_services(id, service:services(id, name, duration_minutes), staff:staff(id, name))
      `)
      .eq('organization_id', orgId)
      .eq('type', 'appointment')
      .in('status', ['scheduled', 'in_progress', 'completed', 'cancelled', 'noshow'])
      .gte('start_time', from + 'T00:00:00')
      .lte('start_time', to + 'T23:59:59')
      .order('start_time', { ascending: true })
    if (error) throw error
    appts.value = data || []
  } finally {
    isLoading.value = false
  }
}

function toISO(d) { return d.toLocaleDateString('en-CA') }

// ── Ranges ─────────────────────────────────────────────────────────────────
const weekDays = computed(() => {
  const d = new Date(refDate.value)
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday)
    dd.setDate(monday.getDate() + i)
    return dd
  })
})

const monthDays = computed(() => {
  const d = refDate.value
  const year = d.getFullYear(), month = d.getMonth()
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const startOffset = (first.getDay() + 6) % 7
  const cells = []
  for (let i = 0; i < startOffset; i++)
    cells.push({ date: new Date(year, month, -startOffset + i + 1), current: false })
  for (let i = 1; i <= last.getDate(); i++)
    cells.push({ date: new Date(year, month, i), current: true })
  const remaining = 42 - cells.length
  for (let i = 1; i <= remaining; i++)
    cells.push({ date: new Date(year, month + 1, i), current: false })
  return cells
})

const periodLabel = computed(() => {
  if (viewMode.value === 'day') {
    return refDate.value.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }
  if (viewMode.value === 'week') {
    const days = weekDays.value
    const from = days[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    const to   = days[6].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
    return `${from} – ${to}`
  }
  return refDate.value.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
})

// ── Navigation ─────────────────────────────────────────────────────────────
function prev() {
  const d = new Date(refDate.value)
  if (viewMode.value === 'day')   d.setDate(d.getDate() - 1)
  if (viewMode.value === 'week')  d.setDate(d.getDate() - 7)
  if (viewMode.value === 'month') d.setMonth(d.getMonth() - 1)
  refDate.value = d
}
function next() {
  const d = new Date(refDate.value)
  if (viewMode.value === 'day')   d.setDate(d.getDate() + 1)
  if (viewMode.value === 'week')  d.setDate(d.getDate() + 7)
  if (viewMode.value === 'month') d.setMonth(d.getMonth() + 1)
  refDate.value = d
}
function goToday() { refDate.value = new Date() }
function goToDay(d) { refDate.value = new Date(d); viewMode.value = 'day' }

// ── Helpers ─────────────────────────────────────────────────────────────────
function apptsForDay(d) {
  const iso = toISO(d)
  return appts.value.filter(a => a.start_time?.startsWith(iso))
}
function apptsForDayStaff(d, staffId) {
  return apptsForDay(d).filter(a => a.appointment_services?.some(s => s.staff?.id === staffId))
}
function apptsForDayUnassigned(d) {
  return apptsForDay(d).filter(a =>
    !a.appointment_services?.length || a.appointment_services.every(s => !s.staff?.id)
  )
}
function clientName(a) {
  const c = a.client
  return c ? [c.name, c.last_name].filter(Boolean).join(' ') : 'Client'
}
function serviceNames(a) {
  return a.appointment_services?.map(s => s.service?.name).filter(Boolean).join(', ') || '—'
}
function apptTime(a) {
  if (!a.start_time) return ''
  const d = new Date(a.start_time)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}
function isToday(d) { return toISO(d) === toISO(new Date()) }

// ── Day view positioning ────────────────────────────────────────────────────
const HOUR_H = 56        // px per hour
const START_H = 8        // 08:00
const HOURS = Array.from({ length: 13 }, (_, i) => i + START_H) // 8..20

function apptTopPx(a) {
  const [h, m] = (a.start_time?.substring(11, 16) || '08:00').split(':').map(Number)
  return ((h - START_H) + m / 60) * HOUR_H
}
function apptDuration(a) {
  return a.appointment_services?.reduce((s, x) => s + (x.service?.duration_minutes || 30), 0) || 30
}
function apptHeightPx(a) {
  return Math.max(24, (apptDuration(a) / 60) * HOUR_H)
}
function apptStartMin(a) {
  const [h, m] = (a.start_time?.substring(11, 16) || '08:00').split(':').map(Number)
  return h * 60 + m
}
function apptEndMin(a) { return apptStartMin(a) + apptDuration(a) }

// Retourne les appointments enrichis avec colIdx et colTotal pour gérer les chevauchements
function layoutApptsForColumn(list) {
  if (!list.length) return []
  // Algo sur tous les RDV pour le positionnement visuel
  const sorted = [...list].sort((a, b) => apptStartMin(a) - apptStartMin(b))
  const cols = []
  const placed = sorted.map(a => {
    const start = apptStartMin(a), end = apptEndMin(a)
    let col = cols.findIndex(endMin => endMin <= start)
    if (col === -1) { col = cols.length; cols.push(end) } else cols[col] = end
    return { appt: a, col }
  })
  const total = cols.length
  return placed.map(r => ({ ...r, total }))
}

const ACTIVE = ['scheduled', 'in_progress']

// Détecte si un RDV actif chevauche un autre RDV actif dans la même liste
function hasOverlap(a, list) {
  if (!ACTIVE.includes(a.status)) return false
  const s1 = apptStartMin(a), e1 = apptEndMin(a)
  return list.some(b => b.id !== a.id && ACTIVE.includes(b.status) && apptStartMin(b) < e1 && apptEndMin(b) > s1)
}

// ── Staff colours ───────────────────────────────────────────────────────────
const PALETTE = ['#0891B2','#8b5cf6','#f59e0b','#ec4899','#22c55e','#f97316','#06b6d4','#6366f1']
function sc(i) { return PALETTE[i % PALETTE.length] }

// ── Couleur par statut ──────────────────────────────────────────────────────
function statusColor(status) {
  if (status === 'completed')                        return '#22c55e'
  if (status === 'cancelled' || status === 'noshow') return '#ef4444'
  return '#0891B2' // scheduled + in_progress
}
function statusBg(status) { return statusColor(status) + '18' }

// ── Load ───────────────────────────────────────────────────────────────────
function loadForView() {
  if (viewMode.value === 'day') {
    fetchRange(toISO(refDate.value), toISO(refDate.value))
  } else if (viewMode.value === 'week') {
    const days = weekDays.value
    fetchRange(toISO(days[0]), toISO(days[6]))
  } else {
    const d = refDate.value
    fetchRange(
      toISO(new Date(d.getFullYear(), d.getMonth(), 1)),
      toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
    )
  }
}

watch([viewMode, refDate], loadForView)
onMounted(loadForView)

defineExpose({ refresh: loadForView })
</script>

<template>
  <div class="pv">

    <!-- Toolbar -->
    <div class="pv-toolbar">
      <div class="pv-tabs">
        <button :class="['pv-tab', viewMode==='day'   && 'on']" @click="viewMode='day'">Jour</button>
        <button :class="['pv-tab', viewMode==='week'  && 'on']" @click="viewMode='week'">Semaine</button>
        <button :class="['pv-tab', viewMode==='month' && 'on']" @click="viewMode='month'">Mois</button>
      </div>
      <div class="pv-nav">
        <button class="pv-arrow" @click="prev">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button class="pv-today" @click="goToday">Aujourd'hui</button>
        <button class="pv-arrow" @click="next">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <span class="pv-label">{{ periodLabel }}</span>
      <div v-if="isLoading" class="pv-spin"></div>
    </div>

    <!-- ═══ VUE JOUR ═══ -->
    <div v-if="viewMode==='day'" class="pv-day">
      <!-- Staff headers -->
      <div class="day-head" :style="`grid-template-columns: 48px repeat(${staff.length}, 1fr) 140px`">
        <div class="day-corner"></div>
        <div v-for="(s,i) in staff" :key="s.id" class="day-sh" :style="{borderTop:`3px solid ${sc(i)}`}">
          <div class="day-av" :style="{background:sc(i)+'22',color:sc(i)}">{{ s.name[0] }}</div>
          <div class="day-sn">{{ s.name }}</div>
          <div class="day-sc" style="font-size:11px;color:#94a3b8">{{ apptsForDayStaff(refDate,s.id).length }} RDV</div>
        </div>
        <!-- Colonne non affecté -->
        <div class="day-sh" style="border-top:3px solid #94a3b8">
          <div class="day-av" style="background:#f1f5f9;color:#94a3b8">?</div>
          <div class="day-sn" style="color:#94a3b8">Non affecté</div>
          <div class="day-sc" style="font-size:11px;color:#94a3b8">{{ apptsForDayUnassigned(refDate).length }} RDV</div>
        </div>
      </div>
      <!-- Body -->
      <div class="day-body" :style="`grid-template-columns: 48px repeat(${staff.length}, 1fr) 140px`">
        <!-- Hours -->
        <div class="day-axis">
          <div v-for="h in HOURS" :key="h" class="day-hr" :style="{height:HOUR_H+'px'}">
            {{ String(h).padStart(2,'0') }}:00
          </div>
        </div>
        <!-- Staff columns -->
        <div v-for="(s,i) in staff" :key="s.id" class="day-col" :style="{height: HOURS.length*HOUR_H+'px'}">
          <div v-for="h in HOURS" :key="h" class="day-hline" :style="{height:HOUR_H+'px'}"></div>
          <div
            v-for="{appt:a, col, total} in layoutApptsForColumn(apptsForDayStaff(refDate,s.id))"
            :key="a.id"
            class="day-appt"
            :style="{
              top: apptTopPx(a)+'px',
              height: apptHeightPx(a)+'px',
              left: (col/total*100)+'%',
              width: (1/total*100)+'%',
              background: statusBg(a.status),
              borderLeft: `3px solid ${statusColor(a.status)}`,
              boxShadow: hasOverlap(a, apptsForDayStaff(refDate,s.id)) ? '2px 2px 6px rgba(0,0,0,.18)' : 'none',
              zIndex: ACTIVE.includes(a.status) ? 1 : 0
            }"
            @click="emit('open-rdv',a)"
          >
            <div class="da-time">
              {{ apptTime(a) }}
              <span v-if="hasOverlap(a, apptsForDayStaff(refDate,s.id))" class="overlap-tag">⚡</span>
              <span v-if="a.is_external" class="ext-tag">Ext.</span>
            </div>
            <div class="da-client">{{ clientName(a) }}</div>
            <div class="da-svc">{{ serviceNames(a) }}</div>
          </div>
        </div>
        <!-- Colonne Non affecté -->
        <div class="day-col" :style="{height: HOURS.length*HOUR_H+'px', background:'#f8fafc'}">
          <div v-for="h in HOURS" :key="h" class="day-hline" :style="{height:HOUR_H+'px'}"></div>
          <div
            v-for="{appt:a, col, total} in layoutApptsForColumn(apptsForDayUnassigned(refDate))"
            :key="a.id"
            class="day-appt"
            :style="{
              top: apptTopPx(a)+'px',
              height: apptHeightPx(a)+'px',
              left: (col/total*100)+'%',
              width: (1/total*100)+'%',
              background: statusBg(a.status),
              borderLeft: `3px solid ${statusColor(a.status)}`,
              boxShadow: hasOverlap(a, apptsForDayUnassigned(refDate)) ? '2px 2px 6px rgba(0,0,0,.18)' : 'none',
              zIndex: ACTIVE.includes(a.status) ? 1 : 0
            }"
            @click="emit('open-rdv',a)"
          >
            <div class="da-time">
              {{ apptTime(a) }}
              <span v-if="hasOverlap(a, apptsForDayUnassigned(refDate))" class="overlap-tag">⚡</span>
              <span v-if="a.is_external" class="ext-tag">Ext.</span>
            </div>
            <div class="da-client">{{ clientName(a) }}</div>
            <div class="da-svc">{{ serviceNames(a) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ VUE SEMAINE ═══ -->
    <div v-else-if="viewMode==='week'" class="pv-week">
      <table class="wk-table">
        <thead>
          <tr>
            <th class="wk-staff-th"></th>
            <th v-for="d in weekDays" :key="toISO(d)" :class="['wk-day-th', isToday(d) && 'today']" style="cursor:pointer" @click="goToDay(d)">
              <div class="wdh-name">{{ d.toLocaleDateString('fr-FR',{weekday:'short'}) }}</div>
              <div :class="['wdh-num', isToday(d) && 'today']">{{ d.getDate() }}</div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(s,i) in staff" :key="s.id">
            <td class="wk-staff-td" :style="{borderLeft:`3px solid ${sc(i)}`}">
              <div class="wk-av" :style="{background:sc(i)+'22',color:sc(i)}">{{ s.name[0] }}</div>
              <span class="wk-name">{{ s.name }}</span>
            </td>
            <td v-for="d in weekDays" :key="toISO(d)" :class="['wk-cell', isToday(d) && 'today']">
              <div
                v-for="a in apptsForDayStaff(d,s.id)" :key="a.id"
                class="wk-appt"
                :style="{
                  borderLeft: hasOverlap(a, apptsForDayStaff(d,s.id)) ? `5px solid ${statusColor(a.status)}` : `3px solid ${statusColor(a.status)}`,
                  background: statusBg(a.status)
                }"
                @click="emit('open-rdv',a)"
              >
                <span class="wk-time">{{ apptTime(a) }}</span>
                <span class="wk-client">{{ clientName(a) }}</span>
                <span v-if="hasOverlap(a, apptsForDayStaff(d,s.id))" class="overlap-tag">⚡</span>
                <span v-if="a.is_external" class="ext-tag">Ext.</span>
              </div>
              <span v-if="!apptsForDayStaff(d,s.id).length" class="wk-empty">—</span>
            </td>
          </tr>
          <!-- Ligne Non affecté -->
          <tr>
            <td class="wk-staff-td" style="border-left:3px solid #94a3b8">
              <div class="wk-av" style="background:#f1f5f9;color:#94a3b8">?</div>
              <span class="wk-name" style="color:#94a3b8">Non affecté</span>
            </td>
            <td v-for="d in weekDays" :key="toISO(d)" :class="['wk-cell', isToday(d) && 'today']">
              <div
                v-for="a in apptsForDayUnassigned(d)" :key="a.id"
                class="wk-appt"
                :style="{
                  borderLeft: hasOverlap(a, apptsForDayUnassigned(d)) ? `5px solid ${statusColor(a.status)}` : `3px solid ${statusColor(a.status)}`,
                  background: statusBg(a.status)
                }"
                @click="emit('open-rdv',a)"
              >
                <span class="wk-time">{{ apptTime(a) }}</span>
                <span class="wk-client">{{ clientName(a) }}</span>
                <span v-if="hasOverlap(a, apptsForDayUnassigned(d))" class="overlap-tag">⚡</span>
                <span v-if="a.is_external" class="ext-tag">Ext.</span>
              </div>
              <span v-if="!apptsForDayUnassigned(d).length" class="wk-empty">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ═══ VUE MOIS ═══ -->
    <div v-else class="pv-month">
      <div class="mo-dow">
        <div v-for="d in ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']" :key="d">{{ d }}</div>
      </div>
      <div class="mo-grid">
        <div
          v-for="cell in monthDays" :key="toISO(cell.date)"
          :class="['mo-cell', !cell.current && 'other', isToday(cell.date) && 'today']"
        >
          <div :class="['mo-num', isToday(cell.date) && 'today']" style="cursor:pointer" @click="goToDay(cell.date)">{{ cell.date.getDate() }}</div>
          <div
            v-for="a in apptsForDay(cell.date).slice(0,3)" :key="a.id"
            class="mo-appt"
            :style="{background: statusColor(a.status)}"
            @click="emit('open-rdv',a)"
          >
            <span class="mo-time">{{ apptTime(a) }}</span> {{ clientName(a) }}
            <span v-if="a.is_external" class="ext-tag-mo">Ext.</span>
          </div>
          <div v-if="apptsForDay(cell.date).length > 3" class="mo-more">+{{ apptsForDay(cell.date).length - 3 }} autres</div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ── Conteneur global ── */
.pv {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

/* ── Toolbar ── */
.pv-toolbar {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 12px 16px;
  background: var(--bg-soft);
  border-bottom: 1px solid var(--border);
}
.pv-tabs { display: flex; background: #e2e8f0; border-radius: 8px; padding: 3px; gap: 2px; }
.pv-tab {
  padding: 5px 14px; border: none; background: transparent; border-radius: 6px;
  font-size: 12.5px; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: all .15s;
}
.pv-tab.on { background: #fff; color: var(--text-main); box-shadow: 0 1px 3px rgba(0,0,0,.1); }

.pv-nav { display: flex; align-items: center; gap: 4px; }
.pv-arrow {
  width: 28px; height: 28px; border: 1px solid var(--border); background: #fff; border-radius: 6px;
  cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-muted);
}
.pv-arrow:hover { background: var(--bg-soft); }
.pv-today {
  padding: 5px 12px; border: 1px solid var(--border); background: #fff; border-radius: 6px;
  font-size: 12.5px; font-weight: 600; color: var(--text-main); cursor: pointer; white-space: nowrap;
}
.pv-today:hover { background: var(--bg-soft); }
.pv-label { font-size: 13px; font-weight: 700; color: var(--text-main); flex: 1; text-transform: capitalize; }
.pv-spin {
  width: 15px; height: 15px; border: 2px solid var(--border); border-top-color: var(--primary);
  border-radius: 50%; animation: spin .6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Tags ── */
.overlap-tag { font-size: 10px; flex-shrink: 0; }
.ext-tag { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 999px; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; flex-shrink: 0; white-space: nowrap; }
.ext-tag-mo { font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 999px; background: rgba(255,255,255,.35); margin-left: 2px; }

/* ════════════════════════════════
   VUE JOUR
════════════════════════════════ */
.pv-day { overflow-x: auto; }

.day-head {
  display: grid;
  position: sticky; top: 0; z-index: 2;
  background: var(--bg-soft);
  border-bottom: 1px solid var(--border);
}
.day-corner { border-right: 1px solid var(--border); width: 48px; }
.day-sh {
  padding: 10px 8px; border-right: 1px solid var(--border);
  display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center;
}
.day-av { width: 30px; height: 30px; border-radius: 8px; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.day-sn { font-size: 12px; font-weight: 700; color: var(--text-main); }

.day-body {
  display: grid;
  position: relative;
}
.day-axis { border-right: 1px solid var(--border); }
.day-hr {
  display: flex; align-items: flex-start; padding: 3px 4px 0;
  font-size: 10px; font-weight: 600; color: var(--text-muted);
  border-bottom: 1px solid var(--border); box-sizing: border-box;
  white-space: nowrap;
}
.day-col { position: relative; border-right: 1px solid var(--border); }
.day-hline { border-bottom: 1px solid var(--border); box-sizing: border-box; }
.day-appt {
  position: absolute;
  border-radius: 5px; padding: 3px 5px; cursor: pointer; overflow: hidden;
  transition: filter .1s; min-height: 22px;
  box-sizing: border-box;
  padding-left: 6px;
}
.day-appt:hover { filter: brightness(.93); }
.da-time { font-size: 10px; font-weight: 700; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }
.da-client { font-size: 11.5px; font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.da-svc { font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ════════════════════════════════
   VUE SEMAINE
════════════════════════════════ */
.pv-week { overflow-x: auto; }
.wk-table {
  width: 100%; border-collapse: collapse;
  min-width: 680px;
}
.wk-table thead th {
  background: var(--bg-soft);
  border-bottom: 2px solid var(--border);
  border-right: 1px solid var(--border);
  padding: 8px;
  text-align: center;
  font-weight: 600;
}
.wk-staff-th { width: 130px; }
.wk-day-th { min-width: 90px; }
.wk-day-th.today { background: #eff6ff; }
.wdh-name { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
.wdh-num { font-size: 18px; font-weight: 800; color: var(--text-main); }
.wdh-num.today {
  background: var(--primary); color: #fff;
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; margin: 2px auto 0;
}
.wk-table tbody td {
  border-bottom: 1px solid var(--border);
  border-right: 1px solid var(--border);
  vertical-align: top;
  padding: 0;
}
.wk-staff-td {
  padding: 10px 10px;
  background: var(--bg-soft);
  display: flex; align-items: center; gap: 8px;
  position: sticky; left: 0;
}
.wk-av { width: 26px; height: 26px; border-radius: 7px; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.wk-name { font-size: 12px; font-weight: 700; color: var(--text-main); }
.wk-cell { padding: 4px 5px; min-height: 52px; }
.wk-cell.today { background: #eff6ff22; }
.wk-appt {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  padding: 3px 6px; border-radius: 5px; margin-bottom: 3px;
  cursor: pointer; font-size: 11.5px; transition: filter .1s;
}
.wk-appt:hover { filter: brightness(.93); }
.wk-time { font-size: 10px; font-weight: 700; color: var(--text-muted); flex-shrink: 0; }
.wk-client { font-weight: 600; color: var(--text-main); }
.wk-empty { font-size: 12px; color: var(--text-light); padding: 8px 6px; display: block; }

/* ════════════════════════════════
   VUE MOIS
════════════════════════════════ */
.pv-month {}
.mo-dow {
  display: grid; grid-template-columns: repeat(7,1fr);
  background: var(--bg-soft); border-bottom: 1px solid var(--border);
}
.mo-dow > div {
  padding: 8px 4px; text-align: center;
  font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;
}
.mo-grid { display: grid; grid-template-columns: repeat(7,1fr); }
.mo-cell {
  min-height: 90px; padding: 5px;
  border-right: 1px solid var(--border); border-bottom: 1px solid var(--border);
  box-sizing: border-box;
}
.mo-cell:nth-child(7n) { border-right: none; }
.mo-cell.other { background: var(--bg-soft); }
.mo-cell.today { background: #eff6ff; }
.mo-num {
  font-size: 12px; font-weight: 700; color: var(--text-muted);
  width: 20px; height: 20px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; margin-bottom: 3px;
  transition: background .15s, color .15s;
}
.mo-num:hover { background: #e2e8f0; color: var(--text-main); }
.mo-num.today { background: var(--primary); color: #fff; }
.mo-cell.other .mo-num { color: #cbd5e1; }
.mo-appt {
  display: flex; align-items: center; gap: 3px;
  padding: 2px 5px; border-radius: 4px; margin-bottom: 2px;
  font-size: 11px; font-weight: 600; color: #fff; cursor: pointer;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: filter .1s;
}
.mo-appt:hover { filter: brightness(.9); }
.mo-time { font-size: 10px; opacity: .85; flex-shrink: 0; }
.mo-more { font-size: 10px; color: var(--text-muted); font-weight: 600; padding: 1px 3px; }
</style>
