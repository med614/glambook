<script setup>
import { ref, computed, onMounted } from 'vue'
import BaseModal from '../modal/BaseModal.vue'
import { fetchDayPayments } from '@/services/appointments.service'

const props = defineProps({
  date: { type: String, required: true }
})
const emit = defineEmits(['close'])

const rows    = ref([])
const loading = ref(true)

onMounted(async () => {
  rows.value = await fetchDayPayments(props.date)
  loading.value = false
})

const isoToHHMM = iso => {
  if (!iso) return '--:--'
  const d = new Date(iso)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

const METHODS = [
  { key: 'cash',     label: 'Espèces',  icon: '💵' },
  { key: 'card',     label: 'Carte',    icon: '💳' },
  { key: 'transfer', label: 'Virement', icon: '🏦' },
]

function methodLabel(key) {
  const m = METHODS.find(m => m.key === key)
  return m ? `${m.icon} ${m.label}` : '—'
}

const paid   = computed(() => rows.value.filter(r => r.payment_status === 'paid'))
const unpaid = computed(() => rows.value.filter(r => r.payment_status !== 'paid'))

const totalCA = computed(() =>
  paid.value.reduce((s, r) => s + (r.total ?? 0), 0)
)

const byMethod = computed(() =>
  METHODS.map(m => ({
    ...m,
    total: paid.value.filter(r => r.payment_method === m.key).reduce((s, r) => s + (r.total ?? 0), 0),
    count: paid.value.filter(r => r.payment_method === m.key).length
  })).filter(m => m.count > 0)
)
</script>

<template>
  <BaseModal title="Caisse du jour" @close="$emit('close')">
    <div class="modal-body caisse-body">

      <div v-if="loading" class="caisse-loading">Chargement…</div>

      <template v-else>

        <!-- KPI principal -->
        <div class="ca-hero">
          <div class="ca-hero-label">CA encaissé</div>
          <div class="ca-hero-amount">{{ totalCA.toLocaleString('fr-FR') }} <span>DH</span></div>
          <div class="ca-hero-sub">{{ paid.length }} paiement{{ paid.length > 1 ? 's' : '' }} · {{ rows.length }} prestations terminées</div>
        </div>

        <!-- Répartition par mode -->
        <div v-if="byMethod.length" class="method-breakdown">
          <div class="section-label-sm">Répartition</div>
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

        <div class="form-divider"></div>

        <!-- Liste payés -->
        <div v-if="paid.length">
          <div class="section-label-sm">Encaissés</div>
          <div class="rdv-list">
            <div v-for="r in paid" :key="r.id" class="rdv-row rdv-row--paid">
              <div class="rdv-time">{{ isoToHHMM(r.start_time) }}</div>
              <div class="rdv-client">{{ r.clientName }}</div>
              <div class="rdv-method">{{ methodLabel(r.payment_method) }}</div>
              <div class="rdv-total">{{ r.total != null ? r.total + ' DH' : '—' }}</div>
            </div>
          </div>
        </div>

        <!-- Liste non payés -->
        <div v-if="unpaid.length">
          <div class="form-divider" style="margin-top:12px"></div>
          <div class="section-label-sm" style="color:var(--orange)">En attente de paiement</div>
          <div class="rdv-list">
            <div v-for="r in unpaid" :key="r.id" class="rdv-row rdv-row--unpaid">
              <div class="rdv-time">{{ isoToHHMM(r.start_time) }}</div>
              <div class="rdv-client">{{ r.clientName }}</div>
              <div class="rdv-method rdv-method--pending">En attente</div>
              <div class="rdv-total">{{ r.total != null ? r.total + ' DH' : '—' }}</div>
            </div>
          </div>
        </div>

        <div v-if="!rows.length" class="caisse-empty">
          Aucune prestation terminée aujourd'hui.
        </div>

      </template>
    </div>

    <div class="modal-actions" style="justify-content:flex-end">
      <button class="btn btn-primary" @click="$emit('close')">Fermer</button>
    </div>
  </BaseModal>
</template>

<style scoped>
.caisse-body { display: flex; flex-direction: column; gap: 16px; }
.caisse-loading { text-align: center; color: var(--text-muted); font-size: 13px; padding: 24px 0; }
.caisse-empty  { text-align: center; color: var(--text-muted); font-size: 13px; padding: 16px 0; }

/* KPI */
.ca-hero {
  background: var(--primary-soft);
  border: 1px solid var(--primary-mid);
  border-radius: 14px;
  padding: 20px 24px;
  text-align: center;
}
.ca-hero-label  { font-size: 11px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: .07em; margin-bottom: 6px; }
.ca-hero-amount { font-size: 38px; font-weight: 900; color: var(--primary); letter-spacing: -.03em; line-height: 1; }
.ca-hero-amount span { font-size: 18px; font-weight: 700; }
.ca-hero-sub    { font-size: 12px; color: var(--text-muted); margin-top: 6px; }

/* Répartition */
.section-label-sm {
  font-size: 10.5px; font-weight: 700; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .07em; margin-bottom: 8px;
}
.method-pills { display: flex; flex-direction: column; gap: 6px; }
.method-pill {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-radius: 10px;
  background: var(--bg-soft); border: 1px solid var(--border);
}
.mp-icon  { font-size: 18px; flex-shrink: 0; }
.mp-info  { flex: 1; display: flex; flex-direction: column; gap: 1px; }
.mp-label { font-size: 13px; font-weight: 700; color: var(--text-main); }
.mp-count { font-size: 11px; color: var(--text-muted); }
.mp-amount { font-size: 14px; font-weight: 800; color: var(--primary); flex-shrink: 0; }

/* Liste RDV */
.rdv-list { display: flex; flex-direction: column; gap: 0; }
.rdv-row {
  display: grid;
  grid-template-columns: 40px 1fr auto auto;
  align-items: center; gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.rdv-row:last-child { border-bottom: none; }
.rdv-time   { font-size: 11.5px; font-weight: 700; color: var(--text-muted); }
.rdv-client { font-weight: 600; color: var(--text-main); }
.rdv-method { font-size: 11.5px; color: var(--text-muted); }
.rdv-method--pending { color: var(--orange); font-weight: 700; }
.rdv-total  { font-weight: 800; color: var(--primary); white-space: nowrap; }
.rdv-row--unpaid { opacity: .7; }
</style>
