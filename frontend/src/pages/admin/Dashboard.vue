<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { supabase } from '@/lib/supabase'
// organization_id filtering is now handled by RLS
import { formatPhone } from '@/utils/phone'

/* ── Filtres ── */
const period = ref('month')   // day | week | month | year
const viewBy = ref('staff')   // staff | service | client
const selectedStaffId = ref(null)
const selectedServiceId = ref(null)
const customStart = ref('')
const customEnd   = ref('')

/* ── Data ── */
const staffList        = ref([])
const serviceList      = ref([])
const appointments     = ref([])
const cancelledRdvs    = ref([])
const walkinAppts      = ref([])   // walk-ins anonymes (sans client_id)
const flaggedClientIds = ref(new Set())
const isLoading        = ref(true)

/* ── Plage de dates selon period ── */
function localDate(d) {
  return d.toLocaleDateString('en-CA') // YYYY-MM-DD sans décalage UTC
}

const dateRange = computed(() => {
  const now = new Date()

  if (period.value === 'custom') {
    return { start: customStart.value, end: customEnd.value }
  }

  if (period.value === 'day') {
    const d = localDate(now)
    return { start: d, end: d }
  }

  if (period.value === 'week') {
    const day = now.getDay() || 7
    const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { start: localDate(mon), end: localDate(sun) }
  }

  if (period.value === 'month') {
    const y = now.getFullYear(), m = now.getMonth()
    return {
      start: localDate(new Date(y, m, 1)),
      end:   localDate(new Date(y, m + 1, 0))
    }
  }

  if (period.value === 'year') {
    const y = now.getFullYear()
    return { start: `${y}-01-01`, end: `${y}-12-31` }
  }
})

const periodLabel = computed(() => {
  const r = dateRange.value
  if (!r?.start) return ''
  if (r.start === r.end) return fmt(r.start)
  return `${fmt(r.start)} → ${fmt(r.end)}`
})

function fmt(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ── Chargement ── */
async function loadRef() {
  const [{ data: s }, { data: sv }] = await Promise.all([
    supabase.from('staff').select('id, name, avatar_url').eq('is_active', true).order('name'),
    supabase.from('services').select('id, name')
  ])
  staffList.value   = s || []
  serviceList.value = sv || []
}

async function loadFlaggedClients() {
  const [{ data: badAppts }, { data: clients }] = await Promise.all([
    supabase.from('appointments').select('client_id').in('status', ['cancelled', 'no_show']),
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

async function loadAppointments() {
  const r = dateRange.value
  if (!r?.start || !r?.end) return

  isLoading.value = true
  try {
    let q = supabase
      .from('appointment_services')
      .select(`
        id,
        staff_id,
        service_id,
        price_at_booking,
        staff:staff_id ( id, name, avatar_url ),
        services:service_id ( id, name ),
        appointments!inner (
          id,
          start_time,
          status,
          clients ( id, name, last_name, phone )
        )
      `)
      .gte('appointments.start_time', r.start + 'T00:00:00')
      .lte('appointments.start_time', r.end + 'T23:59:59')

    if (selectedStaffId.value)   q = q.eq('staff_id', selectedStaffId.value)
    if (selectedServiceId.value) q = q.eq('service_id', selectedServiceId.value)

    const { data, error } = await q
    if (error) throw error
    appointments.value = data || []

    const { data: cxl } = await supabase
      .from('appointments')
      .select('id, status, start_time, clients ( id, name, last_name, phone )')
      .in('status', ['cancelled', 'no_show'])
      .gte('start_time', r.start + 'T00:00:00')
      .lte('start_time', r.end + 'T23:59:59')
    cancelledRdvs.value = cxl || []

    // Walk-ins rapides : saisie sans fiche (walkin_name non null, client_id null)
    const { data: wk } = await supabase
      .from('appointments')
      .select('id, status, start_time, walkin_name, appointment_services ( id, services:service_id ( name ) )')
      .eq('type', 'walkin')
      .not('walkin_name', 'is', null)
      .in('status', ['completed', 'in_progress', 'scheduled', 'waiting'])
      .gte('start_time', r.start + 'T00:00:00')
      .lte('start_time', r.end + 'T23:59:59')
    walkinAppts.value = wk || []

    await loadFlaggedClients()
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await loadRef()
  await loadAppointments()
})

watch([period, selectedStaffId, selectedServiceId], loadAppointments)
watch([customStart, customEnd], () => {
  if (customStart.value && customEnd.value) loadAppointments()
})

/* ── Stats globales ── */
const totalSessions  = computed(() => appointments.value.length)
const uniqueClients  = computed(() => {
  const ids = new Set(appointments.value.map(a => a.appointments?.id).filter(Boolean))
  return ids.size
})

const totalRevenue = computed(() =>
  appointments.value
    .filter(a => ACTIVE_STATUSES.includes(a.appointments?.status) && a.price_at_booking != null)
    .reduce((sum, a) => sum + Number(a.price_at_booking), 0)
)

const avgBasket = computed(() => {
  const rdvIds = new Set(
    appointments.value
      .filter(a => ACTIVE_STATUSES.includes(a.appointments?.status) && a.price_at_booking != null)
      .map(a => a.appointments?.id)
  )
  return rdvIds.size > 0 ? totalRevenue.value / rdvIds.size : 0
})

function formatPrice(v) {
  return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' DH'
}

const ACTIVE_STATUSES = ['completed', 'in_progress', 'scheduled', 'confirmed']

/* ── Groupe par staff ── */
const byStaff = computed(() => {
  const map = {}
  appointments.value
    .filter(a => ACTIVE_STATUSES.includes(a.appointments?.status))
    .forEach(a => {
      const sid = a.staff?.id || 'none'
      if (!map[sid]) map[sid] = { staff: a.staff || { id: 'none', name: 'Non assigné', avatar_url: null }, count: 0, services: {} }
      map[sid].count++
      const svc = a.services?.name || 'Non défini'
      map[sid].services[svc] = (map[sid].services[svc] || 0) + 1
    })
  return Object.values(map).sort((a, b) => b.count - a.count)
})

/* ── Groupe par service ── */
const byService = computed(() => {
  const map = {}
  appointments.value
    .filter(a => ACTIVE_STATUSES.includes(a.appointments?.status))
    .forEach(a => {
      const sid = a.services?.id || 'none'
      if (!map[sid]) map[sid] = { service: a.services || { id: 'none', name: 'Non défini' }, count: 0, staff: {} }
      map[sid].count++
      const stf = a.staff?.name || 'Non assigné'
      map[sid].staff[stf] = (map[sid].staff[stf] || 0) + 1
    })
  return Object.values(map).sort((a, b) => b.count - a.count)
})

/* ── Groupe par client (tous statuts) ── */
const byClient = computed(() => {
  const map = {}

  // IDs des walk-ins rapides (walkin_name non null) → exclus de la liste clients
  const walkinIds = new Set(walkinAppts.value.map(w => w.id))

  // Prestations effectuées par des clients enregistrés (appointment_services)
  appointments.value
    .filter(a => ACTIVE_STATUSES.includes(a.appointments?.status))
    .filter(a => !walkinIds.has(a.appointments?.id)) // exclure les walk-ins
    .forEach(a => {
      const client = a.appointments?.clients
      const cid = client?.id
      if (!cid) return // skip anonymes déjà gérés via walkinAppts
      if (!map[cid]) {
        map[cid] = {
          client,
          isFlagged: flaggedClientIds.value.has(cid),
          count: 0, cancelled: 0, noShow: 0,
          rdvIds: new Set(), services: {}
        }
      }
      map[cid].rdvIds.add(a.appointments?.id)
      map[cid].count++
      const svc = a.services?.name || 'Non défini'
      map[cid].services[svc] = (map[cid].services[svc] || 0) + 1
    })

  // Annulations et no-shows des clients enregistrés
  cancelledRdvs.value
    .filter(a => a.clients?.id) // exclure les anonymes
    .forEach(a => {
      const client = a.clients
      const cid = client.id
      if (!map[cid]) {
        map[cid] = {
          client,
          isFlagged: flaggedClientIds.value.has(cid),
          count: 0, cancelled: 0, noShow: 0,
          rdvIds: new Set(), services: {}
        }
      }
      map[cid].rdvIds.add(a.id)
      if (a.status === 'cancelled') map[cid].cancelled++
      else if (a.status === 'no_show') map[cid].noShow++
    })

  const rows = Object.values(map).map(r => ({
    ...r,
    rdvCount: r.rdvIds.size,
    isWalkin: false
  })).sort((a, b) => (b.count + b.cancelled + b.noShow) - (a.count + a.cancelled + a.noShow))

  // Ligne walk-in unique (walk-ins anonymes)
  if (walkinAppts.value.length) {
    const walkinServices = {}
    let walkinSvcCount = 0
    walkinAppts.value.forEach(w => {
      ;(w.appointment_services || []).forEach(as => {
        const name = as.services?.name || 'Non défini'
        walkinServices[name] = (walkinServices[name] || 0) + 1
        walkinSvcCount++
      })
    })
    rows.push({
      client: { id: '__walkin__', name: 'Walk-in', last_name: '', phone: null },
      isFlagged: false,
      count: walkinSvcCount,
      cancelled: 0,
      noShow: 0,
      rdvCount: walkinAppts.value.length,
      services: walkinServices,
      isWalkin: true
    })
  }

  return rows
})

const maxCount = computed(() => {
  const arr = viewBy.value === 'staff' ? byStaff.value
            : viewBy.value === 'client' ? byClient.value
            : byService.value
  return arr[0]?.count || 1
})

function pct(count) {
  return Math.round((count / maxCount.value) * 100)
}

function initials(name) {
  return name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Tableau de bord</h1>
        <p class="page-desc">Performance et activité de l'équipe</p>
      </div>
    </div>

    <!-- Filtres -->
    <div class="filters-row">
      <!-- Période -->
      <div class="filter-group">
        <button
          v-for="p in [
            { v: 'day', l: 'Jour' },
            { v: 'week', l: 'Semaine' },
            { v: 'month', l: 'Mois' },
            { v: 'year', l: 'Année' },
            { v: 'custom', l: 'Personnalisé' }
          ]"
          :key="p.v"
          class="period-btn"
          :class="{ active: period === p.v }"
          @click="period = p.v"
        >{{ p.l }}</button>
      </div>

      <!-- Dates custom -->
      <div v-if="period === 'custom'" class="custom-range">
        <input type="date" v-model="customStart" style="width:auto;min-width:160px;" />
        <span style="color:var(--text-muted);font-size:13px;">→</span>
        <input type="date" v-model="customEnd" style="width:auto;min-width:160px;" />
      </div>

      <!-- Vue par -->
      <div class="filter-group">
        <button class="period-btn" :class="{ active: viewBy === 'staff' }" @click="viewBy = 'staff'">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          Par collaborateur
        </button>
        <button class="period-btn" :class="{ active: viewBy === 'service' }" @click="viewBy = 'service'">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20 12h-2M6 12H4M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93M12 20v-2M12 6V4"/></svg>
          Par prestation
        </button>
        <button class="period-btn" :class="{ active: viewBy === 'client' }" @click="viewBy = 'client'">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Par client
        </button>
      </div>

      <!-- Filtre staff -->
      <select v-model="selectedStaffId" style="width:auto;min-width:160px;">
        <option :value="null">Tous les collaborateurs</option>
        <option v-for="s in staffList" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>

      <!-- Filtre service -->
      <select v-model="selectedServiceId" style="width:auto;min-width:160px;">
        <option :value="null">Toutes les prestations</option>
        <option v-for="s in serviceList" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
    </div>

    <!-- Période affichée -->
    <div class="period-label">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      {{ periodLabel }}
    </div>

    <!-- KPI cards -->
    <div class="kpi-row">
      <div class="kpi-card kpi-card--revenue">
        <div class="kpi-value">{{ formatPrice(totalRevenue) }}</div>
        <div class="kpi-label">Chiffre d'affaires</div>
      </div>
      <div class="kpi-card kpi-card--basket">
        <div class="kpi-value">{{ avgBasket > 0 ? formatPrice(avgBasket) : '—' }}</div>
        <div class="kpi-label">Panier moyen / RDV</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">{{ totalSessions }}</div>
        <div class="kpi-label">Prestations réalisées</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">{{ uniqueClients }}</div>
        <div class="kpi-label">RDV sur la période</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">{{ byStaff.filter(s => s.staff.id !== 'none').length }}</div>
        <div class="kpi-label">Collaborateurs actifs</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">{{ byService.length }}</div>
        <div class="kpi-label">Prestations différentes</div>
      </div>
    </div>

    <!-- Loader -->
    <div v-if="isLoading" class="empty-state">
      <div class="spinner"></div>
      <p>Chargement…</p>
    </div>

    <!-- Contenu -->
    <template v-else>

      <!-- PAR COLLABORATEUR -->
      <div v-if="viewBy === 'staff'" class="data-card">
        <div class="card-head">Performance par collaborateur</div>
        <div v-if="!byStaff.length" class="empty-state" style="padding:32px;">
          <p>Aucune donnée sur cette période</p>
        </div>
        <div v-else class="staff-rows">
          <div v-for="row in byStaff" :key="row.staff.id" class="perf-row">
            <div class="perf-who">
              <div class="perf-avatar">
                <img v-if="row.staff.avatar_url" :src="row.staff.avatar_url" style="width:100%;height:100%;object-fit:cover;" />
                <span v-else>{{ initials(row.staff.name) }}</span>
              </div>
              <div>
                <div class="perf-name">{{ row.staff.name }}</div>
                <div class="perf-services">
                  <span v-for="(cnt, svc) in row.services" :key="svc" class="svc-tag">{{ svc }} <strong>×{{ cnt }}</strong></span>
                </div>
              </div>
            </div>
            <div class="perf-bar-wrap">
              <div class="perf-bar">
                <div class="perf-bar-fill" :style="{ width: pct(row.count) + '%' }"></div>
              </div>
              <span class="perf-count">{{ row.count }} prestation{{ row.count > 1 ? 's' : '' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- PAR CLIENT -->
      <template v-else-if="viewBy === 'client'">

        <!-- ── SECTION WALK-IN ── -->
        <div class="data-card" style="margin-bottom:16px;">
          <div class="card-head section-head-walkin">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Walk-in (sans fiche)
            <span class="section-count">{{ walkinAppts.length }} passage{{ walkinAppts.length > 1 ? 's' : '' }}</span>
          </div>
          <div v-if="!walkinAppts.length" class="empty-state" style="padding:24px;">
            <p>Aucun walk-in sans fiche sur cette période</p>
          </div>
          <div v-else class="walkin-summary-row">
            <div class="walkin-kpi">
              <div class="walkin-kpi-value">{{ walkinAppts.length }}</div>
              <div class="walkin-kpi-label">Passages</div>
            </div>
            <div class="walkin-kpi">
              <div class="walkin-kpi-value">{{ byClient.find(r => r.isWalkin)?.count || 0 }}</div>
              <div class="walkin-kpi-label">Prestations</div>
            </div>
            <div class="walkin-services">
              <span
                v-for="(cnt, svc) in (byClient.find(r => r.isWalkin)?.services || {})"
                :key="svc"
                class="svc-tag"
              >{{ svc }} <strong>×{{ cnt }}</strong></span>
              <span v-if="!Object.keys(byClient.find(r => r.isWalkin)?.services || {}).length" class="svc-tag" style="color:var(--text-muted);">Aucune prestation enregistrée</span>
            </div>
          </div>
        </div>

        <!-- ── SECTION CLIENTS ENREGISTRÉS ── -->
        <div class="data-card">
          <div class="card-head section-head-clients">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Activité clients
            <span class="section-count">{{ byClient.filter(r => !r.isWalkin).length }} client{{ byClient.filter(r => !r.isWalkin).length > 1 ? 's' : '' }}</span>
          </div>
          <div v-if="!byClient.filter(r => !r.isWalkin).length" class="empty-state" style="padding:32px;">
            <p>Aucun client enregistré sur cette période</p>
          </div>
          <div v-else class="staff-rows">
            <div v-for="row in byClient.filter(r => !r.isWalkin)" :key="row.client.id" class="perf-row">
              <div class="perf-who">
                <div class="client-avatar">
                  {{ initials((row.client.name || '') + ' ' + (row.client.last_name || '')) }}
                </div>
                <div>
                  <div class="perf-name" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    {{ row.client.name }} {{ row.client.last_name }}
                    <span v-if="row.isFlagged" class="status-badge flagged">⚠ Signalé</span>
                    <span v-if="row.cancelled > 0" class="status-badge cancelled">{{ row.cancelled }} annulation{{ row.cancelled > 1 ? 's' : '' }}</span>
                    <span v-if="row.noShow > 0" class="status-badge noshow">{{ row.noShow }} no-show{{ row.noShow > 1 ? 's' : '' }}</span>
                  </div>
                  <div class="perf-services">
                    <span v-for="(cnt, svc) in row.services" :key="svc" class="svc-tag">{{ svc }} <strong>×{{ cnt }}</strong></span>
                  </div>
                </div>
              </div>
              <div class="perf-bar-wrap">
                <div class="perf-bar">
                  <div class="perf-bar-fill client-fill" :style="{ width: pct(row.count) + '%' }"></div>
                </div>
                <span class="perf-count">{{ row.rdvCount }} RDV · {{ row.count }} prestation{{ row.count > 1 ? 's' : '' }}</span>
              </div>
            </div>
          </div>
        </div>

      </template>

      <!-- PAR PRESTATION -->
      <div v-else class="data-card">
        <div class="card-head">Performance par prestation</div>
        <div v-if="!byService.length" class="empty-state" style="padding:32px;">
          <p>Aucune donnée sur cette période</p>
        </div>
        <div v-else class="staff-rows">
          <div v-for="row in byService" :key="row.service.id" class="perf-row">
            <div class="perf-who">
              <div class="svc-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20 12h-2M6 12H4M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93M12 20v-2M12 6V4"/></svg>
              </div>
              <div>
                <div class="perf-name">{{ row.service.name }}</div>
                <div class="perf-services">
                  <span v-for="(cnt, stf) in row.staff" :key="stf" class="svc-tag">{{ stf }} <strong>×{{ cnt }}</strong></span>
                </div>
              </div>
            </div>
            <div class="perf-bar-wrap">
              <div class="perf-bar">
                <div class="perf-bar-fill svc-fill" :style="{ width: pct(row.count) + '%' }"></div>
              </div>
              <span class="perf-count">{{ row.count }} fois</span>
            </div>
          </div>
        </div>
      </div>

    </template>
  </div>
</template>

<style scoped>
/* Filtres */
.filters-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.filter-group {
  display: flex;
  background: var(--bg-main);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.period-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 13px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  border-right: 1px solid var(--border);
  transition: all .15s;
}
.period-btn:last-child { border-right: none; }
.period-btn:hover { background: var(--bg-card); color: var(--text-main); }
.period-btn.active { background: var(--primary); color: #fff; }

.custom-range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-input-sm {
  padding: 7px 10px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-main);
  color: var(--text-main);
}
.form-input-sm:focus { outline: none; border-color: var(--primary); }

.period-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 600;
  margin-bottom: 16px;
}

/* KPI */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.kpi-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px 20px;
  text-align: center;
}

.kpi-card--revenue {
  background: var(--green-soft);
  border-color: rgba(21,128,61,.25);
}
.kpi-card--revenue .kpi-value { color: var(--green); }

.kpi-card--basket {
  background: var(--blue-soft);
  border-color: rgba(29,78,216,.25);
}
.kpi-card--basket .kpi-value { color: var(--blue); }

.kpi-value {
  font-size: 32px;
  font-weight: 800;
  color: var(--primary);
  line-height: 1;
}

.kpi-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 600;
  margin-top: 6px;
}

/* Card */
.card-head {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-main);
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
}

/* Rows */
.staff-rows { display: flex; flex-direction: column; }

.perf-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  transition: background .12s;
}
.perf-row:last-child { border-bottom: none; }
.perf-row:hover { background: var(--bg-main); }

.perf-who {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 280px;
  flex-shrink: 0;
}

.perf-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary-text);
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border: 2px solid var(--border);
}

.svc-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: var(--primary-soft);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.perf-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.perf-services {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.svc-tag {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-main);
  border: 1px solid var(--border);
  padding: 1px 6px;
  border-radius: 999px;
}

.perf-bar-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.perf-bar {
  flex: 1;
  height: 10px;
  background: var(--bg-main);
  border-radius: 999px;
  overflow: hidden;
}

.perf-bar-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 999px;
  transition: width .4s ease;
}

.svc-fill { background: var(--primary); }
.client-fill { background: var(--blue); }

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
}
.status-badge.cancelled { background: var(--status-cancelled-bg); color: var(--status-cancelled-text); border: 1px solid var(--status-cancelled-border); }
.status-badge.noshow    { background: var(--status-noshow-bg);    color: var(--status-noshow-text);    border: 1px solid var(--status-noshow-border); }
.status-badge.flagged   { background: var(--orange-soft); color: var(--orange); border: 1px solid rgba(217,119,6,.25); }

.client-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--blue-soft);
  color: var(--blue);
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 2px solid var(--border);
}
/* ── Walk-in section ── */
.section-head-walkin {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-soft);
  color: var(--text-muted);
}
.section-head-clients {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-main);
}
.section-count {
  margin-left: auto;
  font-size: 11.5px;
  font-weight: 700;
  background: var(--bg-soft);
  color: var(--text-muted);
  padding: 2px 10px;
  border-radius: 999px;
}
.walkin-summary-row {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 20px 24px;
}
.walkin-kpi {
  text-align: center;
  min-width: 64px;
}
.walkin-kpi-value {
  font-size: 28px;
  font-weight: 800;
  color: var(--text-muted);
  line-height: 1;
}
.walkin-kpi-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: .04em;
}
.walkin-services {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  border-left: 2px solid var(--border);
  padding-left: 24px;
  flex: 1;
}

.perf-count {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
  min-width: 90px;
  text-align: right;
}

/* Spinner */
.spinner {
  width: 28px; height: 28px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 768px) {
  .kpi-row { grid-template-columns: repeat(3, 1fr); }
  .perf-who { width: 160px; }
  .filters-row { flex-direction: column; align-items: flex-start; }
}
</style>
