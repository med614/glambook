<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchDayPayments } from '@/services/appointments.service'

const props = defineProps({
  date: { type: String, required: true }
})
const emit = defineEmits(['close', 'refresh', 'encaisser'])

const rows    = ref([])
const loading = ref(true)
const saving  = ref(null) // id en cours d'encaissement

async function load() {
  loading.value = true
  rows.value = await fetchDayPayments(props.date)
  loading.value = false
}

onMounted(load)

const isoToHHMM = iso => {
  if (!iso) return '--:--'
  const d = new Date(iso)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

const METHODS = [
  { key: 'cash', label: 'Espèces', icon: '💵' },
  { key: 'card', label: 'Carte',   icon: '💳' },
]

function methodLabel(key) {
  return METHODS.find(m => m.key === key)?.label || '—'
}

const paid   = computed(() => rows.value.filter(r => r.payment_status === 'paid'))
const unpaid = computed(() => rows.value.filter(r => r.payment_status !== 'paid'))

const totalCA = computed(() => paid.value.reduce((s, r) => s + (r.total ?? 0), 0))

const byMethod = computed(() =>
  METHODS.map(m => ({
    ...m,
    total: paid.value.filter(r => r.payment_method === m.key).reduce((s, r) => s + (r.total ?? 0), 0),
    count: paid.value.filter(r => r.payment_method === m.key).length
  })).filter(m => m.count > 0)
)

</script>

<template>
  <Teleport to="body">
    <!-- Overlay -->
    <div class="drawer-overlay" @click.self="$emit('close')"></div>

    <!-- Panneau -->
    <div class="drawer">
      <!-- Header -->
      <div class="drawer-header">
        <div class="drawer-title">
          <div class="drawer-dot"></div>
          Caisse du jour
        </div>
        <button class="drawer-close" @click="$emit('close')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="drawer-body">
        <div v-if="loading" class="drawer-loading">Chargement…</div>

        <template v-else>

          <!-- KPI -->
          <div class="ca-hero">
            <div class="ca-label">CA encaissé</div>
            <div class="ca-amount">{{ totalCA.toLocaleString('fr-FR') }}<span> DH</span></div>
            <div class="ca-sub">{{ paid.length }} payé{{ paid.length > 1 ? 's' : '' }} · {{ unpaid.length }} en attente</div>
          </div>

          <!-- Répartition -->
          <div v-if="byMethod.length" class="section">
            <div class="section-title">Répartition</div>
            <div class="method-pills">
              <div v-for="m in byMethod" :key="m.key" class="method-pill">
                <span class="mp-icon">{{ m.icon }}</span>
                <div class="mp-info">
                  <span class="mp-label">{{ m.label }}</span>
                  <span class="mp-count">{{ m.count }} paiement{{ m.count > 1 ? 's' : '' }}</span>
                </div>
                <span class="mp-amount">{{ m.total.toLocaleString('fr-FR') }} DH</span>
              </div>
            </div>
          </div>

          <!-- En attente de paiement -->
          <div v-if="unpaid.length" class="section">
            <div class="section-title section-title--orange">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12" stroke="white" stroke-width="2"/><line x1="12" y1="16" x2="12.01" y2="16" stroke="white" stroke-width="2"/></svg>
              À encaisser ({{ unpaid.length }})
            </div>
            <div class="unpaid-list">
              <div v-for="r in unpaid" :key="r.id" class="unpaid-row">
                <div class="ur-top">
                  <span class="ur-time">{{ isoToHHMM(r.start_time) }}</span>
                  <span class="ur-client">{{ r.clientName }}</span>
                  <span class="ur-total">{{ r.total != null ? r.total + ' DH' : '—' }}</span>
                </div>
                <button class="ur-btn-pay" @click="emit('encaisser', r.id)">
                  Encaisser →
                </button>
              </div>
            </div>
          </div>

          <!-- Payés -->
          <div v-if="paid.length" class="section">
            <div class="section-title">Encaissés</div>
            <div class="paid-list">
              <div v-for="r in paid" :key="r.id" class="paid-row">
                <span class="pr-time">{{ isoToHHMM(r.start_time) }}</span>
                <span class="pr-client">{{ r.clientName }}</span>
                <span class="pr-method">{{ METHODS.find(m=>m.key===r.payment_method)?.icon }} {{ methodLabel(r.payment_method) }}</span>
                <span class="pr-total">{{ r.total != null ? r.total + ' DH' : '—' }}</span>
              </div>
            </div>
          </div>

          <div v-if="!rows.length" class="drawer-empty">
            Aucune prestation terminée aujourd'hui.
          </div>

        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.drawer-overlay {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(28,26,16,.4);
  backdrop-filter: blur(3px);
}

.drawer {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 301;
  width: 400px; max-width: 95vw;
  background: var(--bg-card);
  border-left: 1px solid var(--border);
  display: flex; flex-direction: column;
  box-shadow: -8px 0 40px rgba(0,0,0,.12);
  animation: slideIn .2s ease;
}

@keyframes slideIn {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}

/* Header */
.drawer-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px; height: 56px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.drawer-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 800; color: var(--text-main);
}

.drawer-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--primary); box-shadow: 0 0 0 3px var(--primary-mid);
}

.drawer-close {
  width: 30px; height: 30px; border-radius: 8px;
  background: var(--bg-soft); border: 1px solid var(--border);
  color: var(--text-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all .12s;
}
.drawer-close:hover { color: var(--text-main); background: var(--bg-elevated, var(--bg-soft)); }

/* Body */
.drawer-body {
  flex: 1; overflow-y: auto; padding: 20px;
  display: flex; flex-direction: column; gap: 20px;
}

.drawer-loading,
.drawer-empty {
  text-align: center; color: var(--text-muted);
  font-size: 13px; padding: 32px 0;
}

/* KPI */
.ca-hero {
  background: var(--primary-soft); border: 1px solid var(--primary-mid);
  border-radius: 14px; padding: 18px 20px; text-align: center;
}
.ca-label  { font-size: 10.5px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: .07em; margin-bottom: 4px; }
.ca-amount { font-size: 34px; font-weight: 900; color: var(--primary); letter-spacing: -.03em; }
.ca-amount span { font-size: 16px; font-weight: 700; }
.ca-sub    { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

/* Sections */
.section { display: flex; flex-direction: column; gap: 8px; }
.section-title {
  font-size: 10.5px; font-weight: 700; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .07em;
}
.section-title--orange {
  display: flex; align-items: center; gap: 5px;
  color: var(--orange);
}

/* Mode pills */
.method-pills { display: flex; flex-direction: column; gap: 6px; }
.method-pill {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-radius: 10px;
  background: var(--bg-soft); border: 1px solid var(--border);
}
.mp-icon  { font-size: 18px; }
.mp-info  { flex: 1; display: flex; flex-direction: column; gap: 1px; }
.mp-label { font-size: 13px; font-weight: 700; color: var(--text-main); }
.mp-count { font-size: 11px; color: var(--text-muted); }
.mp-amount { font-size: 14px; font-weight: 800; color: var(--primary); }

/* Unpaid list */
.unpaid-list { display: flex; flex-direction: column; gap: 10px; }
.unpaid-row {
  background: var(--bg-soft); border: 1px solid rgba(217,119,6,.2);
  border-radius: 12px; padding: 11px 13px;
  display: flex; flex-direction: column; gap: 8px;
}
.ur-top {
  display: flex; align-items: center; gap: 8px;
}
.ur-time   { font-size: 11.5px; font-weight: 700; color: var(--text-muted); flex-shrink: 0; }
.ur-client { flex: 1; font-size: 13.5px; font-weight: 700; color: var(--text-main); }
.ur-total  { font-size: 14px; font-weight: 800; color: var(--primary); flex-shrink: 0; }
.ur-btn-pay {
  width: 100%; padding: 8px; border-radius: 8px; border: none;
  background: var(--primary); color: #fff;
  font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit;
  transition: background .12s; margin-top: 2px;
}
.ur-btn-pay:hover { background: #8A6A08; }

/* Paid list */
.paid-list { display: flex; flex-direction: column; gap: 0; }
.paid-row {
  display: grid; grid-template-columns: 38px 1fr auto auto;
  align-items: center; gap: 8px;
  padding: 9px 0; border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.paid-row:last-child { border-bottom: none; }
.pr-time   { font-size: 11.5px; font-weight: 700; color: var(--text-muted); }
.pr-client { font-weight: 600; color: var(--text-main); }
.pr-method { font-size: 12px; color: var(--text-muted); }
.pr-total  { font-weight: 800; color: var(--primary); white-space: nowrap; }
</style>
