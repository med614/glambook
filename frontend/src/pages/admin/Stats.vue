<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { supabase } from '@/lib/supabase'

/* ── Période ── */
const period     = ref('month')
const customStart = ref('')
const customEnd   = ref('')

function localDate(d) { return d.toLocaleDateString('en-CA') }

const dateRange = computed(() => {
  const now = new Date()
  if (period.value === 'custom') return { start: customStart.value, end: customEnd.value }
  if (period.value === 'day') { const d = localDate(now); return { start: d, end: d } }
  if (period.value === 'week') {
    const day = now.getDay() || 7
    const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { start: localDate(mon), end: localDate(sun) }
  }
  if (period.value === 'month') {
    const y = now.getFullYear(), m = now.getMonth()
    return { start: localDate(new Date(y, m, 1)), end: localDate(new Date(y, m + 1, 0)) }
  }
  if (period.value === 'year') {
    return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` }
  }
})

function fmt(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const periodLabel = computed(() => {
  const r = dateRange.value
  if (!r?.start) return ''
  if (r.start === r.end) return fmt(r.start)
  return `${fmt(r.start)} → ${fmt(r.end)}`
})

function formatPrice(v) {
  return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' DH'
}

/* ── Data ── */
const rows      = ref([])
const isLoading = ref(true)

const ACTIVE = ['completed', 'in_progress', 'scheduled', 'confirmed']

async function load() {
  const r = dateRange.value
  if (!r?.start || !r?.end) return
  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('appointment_services')
      .select(`
        id,
        price_at_booking,
        staff:staff_id ( id, name ),
        services:service_id ( id, name, price ),
        appointments!inner ( id, status, start_time )
      `)
      .gte('appointments.start_time', r.start + 'T00:00:00')
      .lte('appointments.start_time', r.end + 'T23:59:59')
    if (error) throw error
    rows.value = (data || []).filter(row => ACTIVE.includes(row.appointments?.status))
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
watch([period], load)
watch([customStart, customEnd], () => { if (customStart.value && customEnd.value) load() })

/* ── KPIs globaux ── */
const totalRevenue = computed(() =>
  rows.value.filter(r => r.price_at_booking != null).reduce((s, r) => s + Number(r.price_at_booking), 0)
)
const pricedCount  = computed(() => rows.value.filter(r => r.price_at_booking != null).length)
const unpricedCount = computed(() => rows.value.filter(r => r.price_at_booking == null).length)
const rdvCount     = computed(() => new Set(rows.value.map(r => r.appointments?.id)).size)
const avgBasket    = computed(() => {
  const rdvWithPrice = new Set(rows.value.filter(r => r.price_at_booking != null).map(r => r.appointments?.id))
  return rdvWithPrice.size > 0 ? totalRevenue.value / rdvWithPrice.size : 0
})

/* ── Par prestation ── */
const byService = computed(() => {
  const map = {}
  for (const r of rows.value) {
    const id = r.services?.id || 'none'
    const name = r.services?.name || 'Non défini'
    if (!map[id]) map[id] = { name, revenue: 0, count: 0, hasPrice: false }
    map[id].count++
    if (r.price_at_booking != null) { map[id].revenue += Number(r.price_at_booking); map[id].hasPrice = true }
  }
  return Object.values(map).sort((a, b) => b.revenue - a.revenue)
})

const maxServiceRev = computed(() => byService.value[0]?.revenue || 1)

/* ── Par collaborateur ── */
const byStaff = computed(() => {
  const map = {}
  for (const r of rows.value) {
    const id = r.staff?.id || 'none'
    const name = r.staff?.name || 'Non assigné'
    if (!map[id]) map[id] = { name, revenue: 0, count: 0 }
    map[id].count++
    if (r.price_at_booking != null) map[id].revenue += Number(r.price_at_booking)
  }
  return Object.values(map).sort((a, b) => b.revenue - a.revenue)
})

const maxStaffRev = computed(() => byStaff.value[0]?.revenue || 1)

/* ── Par jour (courbe) ── */
const byDay = computed(() => {
  const map = {}
  for (const r of rows.value) {
    const d = r.appointments?.start_time?.substring(0, 10)
    if (!d) continue
    if (!map[d]) map[d] = 0
    if (r.price_at_booking != null) map[d] += Number(r.price_at_booking)
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([date, revenue]) => ({
    date,
    label: new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
    revenue
  }))
})

const maxDayRev = computed(() => Math.max(...byDay.value.map(d => d.revenue), 1))
</script>

<template>
  <div class="page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Statistiques</h1>
        <p class="page-desc">{{ periodLabel }}</p>
      </div>

      <!-- Filtres période -->
      <div class="period-tabs">
        <button v-for="p in [['day','Aujourd\'hui'],['week','Semaine'],['month','Mois'],['year','Année'],['custom','Période']]"
          :key="p[0]" class="period-btn" :class="{ active: period === p[0] }" @click="period = p[0]">
          {{ p[1] }}
        </button>
      </div>
    </div>

    <!-- Dates custom -->
    <div v-if="period === 'custom'" class="custom-range">
      <input type="date" v-model="customStart" />
      <span>→</span>
      <input type="date" v-model="customEnd" />
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="empty-state">
      <div class="page-spinner"></div>
      <p>Chargement…</p>
    </div>

    <template v-else>
      <!-- KPIs -->
      <div class="kpi-row">
        <div class="kpi-card kpi-revenue">
          <div class="kpi-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div class="kpi-value">{{ formatPrice(totalRevenue) }}</div>
          <div class="kpi-label">Chiffre d'affaires</div>
        </div>
        <div class="kpi-card kpi-basket">
          <div class="kpi-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          </div>
          <div class="kpi-value">{{ avgBasket > 0 ? formatPrice(avgBasket) : '—' }}</div>
          <div class="kpi-label">Panier moyen / RDV</div>
        </div>
        <div class="kpi-card kpi-rdv">
          <div class="kpi-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div class="kpi-value">{{ rdvCount }}</div>
          <div class="kpi-label">RDV sur la période</div>
        </div>
        <div class="kpi-card kpi-services">
          <div class="kpi-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </div>
          <div class="kpi-value">{{ pricedCount }}</div>
          <div class="kpi-label">Prestations tarifées</div>
          <div v-if="unpricedCount" class="kpi-sub">{{ unpricedCount }} sans prix</div>
        </div>
      </div>

      <!-- Courbe CA par jour -->
      <div v-if="byDay.length > 1" class="data-card chart-card">
        <div class="chart-header">
          <span class="chart-title">CA par jour</span>
        </div>
        <div class="bar-chart">
          <div v-for="d in byDay" :key="d.date" class="bar-col">
            <div class="bar-amount">{{ d.revenue > 0 ? formatPrice(d.revenue) : '' }}</div>
            <div class="bar-wrap">
              <div class="bar-fill" :style="{ height: Math.max(4, (d.revenue / maxDayRev) * 120) + 'px' }"></div>
            </div>
            <div class="bar-label">{{ d.label }}</div>
          </div>
        </div>
      </div>

      <div class="two-col">
        <!-- Par prestation -->
        <div class="data-card">
          <div class="section-head">Top prestations</div>
          <div v-if="!byService.length" class="empty-mini">Aucune donnée</div>
          <div v-for="svc in byService" :key="svc.name" class="perf-row">
            <div class="perf-info">
              <div class="perf-name">{{ svc.name }}</div>
              <div class="perf-meta">{{ svc.count }} prestation{{ svc.count > 1 ? 's' : '' }}</div>
            </div>
            <div class="perf-right">
              <span class="perf-revenue">{{ svc.hasPrice ? formatPrice(svc.revenue) : '—' }}</span>
              <div class="mini-bar-wrap">
                <div class="mini-bar-fill" :style="{ width: (svc.revenue / maxServiceRev * 100) + '%' }"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Par collaborateur -->
        <div class="data-card">
          <div class="section-head">Par collaborateur</div>
          <div v-if="!byStaff.length" class="empty-mini">Aucune donnée</div>
          <div v-for="st in byStaff" :key="st.name" class="perf-row">
            <div class="perf-info">
              <div class="perf-name">{{ st.name }}</div>
              <div class="perf-meta">{{ st.count }} prestation{{ st.count > 1 ? 's' : '' }}</div>
            </div>
            <div class="perf-right">
              <span class="perf-revenue">{{ st.revenue > 0 ? formatPrice(st.revenue) : '—' }}</span>
              <div class="mini-bar-wrap">
                <div class="mini-bar-fill staff-fill" :style="{ width: (st.revenue / maxStaffRev * 100) + '%' }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Period tabs */
.period-tabs { display: flex; gap: 4px; background: var(--bg-soft); border-radius: 10px; padding: 3px; }
.period-btn {
  padding: 6px 14px; border-radius: 8px; border: none; background: transparent;
  font-size: 13px; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: all .15s;
}
.period-btn.active { background: #fff; color: var(--primary); box-shadow: 0 1px 4px rgba(0,0,0,.1); }

.custom-range {
  display: flex; align-items: center; gap: 10px; margin-bottom: 16px;
  font-size: 13.5px; color: var(--text-muted);
}
.custom-range input { width: 160px; }

/* KPI row */
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px; }

.kpi-card {
  border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 6px;
  border: 1px solid var(--border);
}
.kpi-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-bottom: 4px; }
.kpi-value { font-size: 28px; font-weight: 800; line-height: 1; }
.kpi-label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
.kpi-sub { font-size: 11px; color: #f59e0b; font-weight: 600; }

.kpi-revenue { background: linear-gradient(135deg, #ecfdf5, #d1fae5); border-color: #6ee7b7; }
.kpi-revenue .kpi-icon { background: #d1fae5; color: #059669; }
.kpi-revenue .kpi-value { color: #059669; }

.kpi-basket { background: linear-gradient(135deg, #eff6ff, #dbeafe); border-color: #93c5fd; }
.kpi-basket .kpi-icon { background: #dbeafe; color: #2563eb; }
.kpi-basket .kpi-value { color: #2563eb; }

.kpi-rdv { background: linear-gradient(135deg, #f5f3ff, #ede9fe); border-color: #c4b5fd; }
.kpi-rdv .kpi-icon { background: #ede9fe; color: #7c3aed; }
.kpi-rdv .kpi-value { color: #7c3aed; }

.kpi-services { background: linear-gradient(135deg, #fff7ed, #fed7aa); border-color: #fdba74; }
.kpi-services .kpi-icon { background: #fed7aa; color: #ea580c; }
.kpi-services .kpi-value { color: #ea580c; }

/* Chart */
.chart-card { margin-bottom: 20px; }
.chart-header { padding: 16px 20px 0; }
.chart-title { font-size: 14px; font-weight: 700; color: var(--text-main); }

.bar-chart {
  display: flex; align-items: flex-end; gap: 8px;
  padding: 16px 20px 20px; overflow-x: auto; min-height: 180px;
}
.bar-col { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 50px; flex: 1; }
.bar-amount { font-size: 10px; font-weight: 700; color: var(--primary); white-space: nowrap; min-height: 14px; }
.bar-wrap { display: flex; align-items: flex-end; width: 100%; justify-content: center; }
.bar-fill { width: 70%; background: linear-gradient(180deg, #0891b2, #06b6d4); border-radius: 4px 4px 0 0; min-height: 4px; transition: height .3s ease; }
.bar-label { font-size: 11px; color: var(--text-muted); white-space: nowrap; }

/* Two col */
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

.section-head { padding: 16px 20px 12px; font-size: 14px; font-weight: 700; color: var(--text-main); border-bottom: 1px solid var(--border); }

.perf-row {
  display: flex; align-items: center; gap: 12px; padding: 12px 20px;
  border-bottom: 1px solid var(--border);
}
.perf-row:last-child { border-bottom: none; }
.perf-info { flex: 1; min-width: 0; }
.perf-name { font-size: 13.5px; font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.perf-meta { font-size: 11.5px; color: var(--text-muted); }
.perf-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; min-width: 90px; }
.perf-revenue { font-size: 14px; font-weight: 800; color: #059669; }
.mini-bar-wrap { width: 80px; height: 5px; background: var(--bg-soft); border-radius: 99px; overflow: hidden; }
.mini-bar-fill { height: 100%; background: var(--primary); border-radius: 99px; transition: width .3s; }
.mini-bar-fill.staff-fill { background: #7c3aed; }

.empty-mini { padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px; }

.page-spinner {
  width: 24px; height: 24px; border: 2.5px solid var(--border);
  border-top-color: var(--primary); border-radius: 50%; animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 768px) {
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .two-col { grid-template-columns: 1fr; }
  .period-tabs { flex-wrap: wrap; }
}
</style>
