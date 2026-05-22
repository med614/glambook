<script setup>
import { ref, computed } from 'vue'
import BaseModal from '../modal/BaseModal.vue'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/composables/useToast'
import { payAppointment } from '@/services/appointments.service'

const props = defineProps({
  row: { type: Object, required: true } // row de planning (a) — a.raw = appointment complet
})
const emit = defineEmits(['close', 'refresh'])

const { toast } = useToast()
const saving = ref(false)
const method = ref(null)

const normOne = v => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

// Toutes les prestations non annulées du RDV
const appt = computed(() => props.row.raw || props.row)

const services = computed(() =>
  (appt.value.appointment_services || [])
    .filter(as => as.status !== 'cancelled')
    .map(as => ({
      id:       as.id,
      name:     normOne(as.service)?.name || 'Prestation',
      price:    as.price_at_booking,
      staffName: normOne(as.staff)?.name || null,
    }))
)

// Prix éditables par service (indexés par svcId)
const editPrices = ref(
  Object.fromEntries(services.value.map(s => [s.id, s.price != null ? String(s.price) : '']))
)

function parsePrice(val) {
  const n = parseFloat(val)
  return isNaN(n) ? null : n
}

const total = computed(() =>
  services.value.reduce((sum, s) => {
    const p = parsePrice(editPrices.value[s.id])
    return sum + (p ?? s.price ?? 0)
  }, 0)
)

const clientName = computed(() => {
  const c = appt.value.client
  if (!c) return appt.value.walkin_name || props.row.client || 'Client'
  const cn = normOne(c)
  return (((cn?.name || '') + ' ' + (cn?.last_name || '')).trim()) || props.row.client || 'Client'
})

const METHODS = [
  { key: 'cash', label: 'Espèces', icon: '💵' },
  { key: 'card', label: 'Carte',   icon: '💳' },
]

async function encaisser() {
  if (!method.value) return
  saving.value = true
  try {
    // Mettre à jour les prix modifiés
    for (const svc of services.value) {
      const newPrice = parsePrice(editPrices.value[svc.id])
      if (newPrice !== null && newPrice !== svc.price) {
        await supabase.from('appointment_services')
          .update({ price_at_booking: newPrice })
          .eq('id', svc.id)
      }
    }
    await payAppointment(appt.value.id, method.value)
    toast.success('Paiement enregistré ✓')
    emit('refresh')
    emit('close')
  } catch (e) {
    console.error(e)
    toast.error('Erreur lors de l\'encaissement')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseModal :title="`Encaisser — ${clientName}`" @close="$emit('close')">
    <div class="modal-body enc-body">

      <!-- Liste prestations avec prix éditables -->
      <div class="svc-list">
        <div v-for="svc in services" :key="svc.id" class="svc-line">
          <div class="svc-info">
            <div class="svc-name">{{ svc.name }}</div>
            <div v-if="svc.staffName" class="svc-staff">{{ svc.staffName }}</div>
          </div>
          <div class="price-wrap">
            <input
              v-model="editPrices[svc.id]"
              type="number" min="0" step="1"
              class="price-input"
              placeholder="0"
            />
            <span class="price-suffix">DH</span>
          </div>
        </div>
      </div>

      <!-- Total -->
      <div class="total-row">
        <span class="total-label">Total</span>
        <span class="total-amount">{{ total.toLocaleString('fr-FR') }} DH</span>
      </div>

      <div class="form-divider"></div>

      <!-- Mode de paiement -->
      <div class="enc-mode">
        <label class="form-label">Mode de paiement</label>
        <div class="method-grid">
          <button
            v-for="m in METHODS" :key="m.key"
            class="method-btn"
            :class="{ 'method-btn--active': method === m.key }"
            @click="method = m.key"
            type="button"
          >
            <span class="method-icon">{{ m.icon }}</span>
            <span>{{ m.label }}</span>
          </button>
        </div>
      </div>

    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" @click="$emit('close')" :disabled="saving">Annuler</button>
      <button class="btn btn-primary" :disabled="!method || saving" @click="encaisser">
        {{ saving ? 'En cours…' : `Encaisser ${total.toLocaleString('fr-FR')} DH` }}
      </button>
    </div>
  </BaseModal>
</template>

<style scoped>
.enc-body { display: flex; flex-direction: column; gap: 14px; }

/* Prestations */
.svc-list { display: flex; flex-direction: column; gap: 0; }
.svc-line {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.svc-line:last-child { border-bottom: none; }
.svc-info  { flex: 1; min-width: 0; }
.svc-name  { font-size: 13.5px; font-weight: 700; color: var(--text-main); }
.svc-staff { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; }

/* Total */
.total-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px;
  background: var(--primary-soft); border: 1px solid var(--primary-mid);
  border-radius: 11px;
}
.total-label  { font-size: 13px; font-weight: 600; color: var(--primary); }
.total-amount { font-size: 18px; font-weight: 900; color: var(--primary); }

/* Mode */
.enc-mode { display: flex; flex-direction: column; gap: 8px; }
.method-grid { display: flex; gap: 8px; }
.method-btn {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px;
  padding: 10px 6px; border-radius: 11px;
  background: var(--bg-soft); border: 1px solid var(--border);
  font-size: 12px; font-weight: 600; color: var(--text-muted);
  cursor: pointer; font-family: inherit; transition: all .15s;
}
.method-btn:hover { border-color: var(--primary); color: var(--primary); }
.method-btn--active { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
.method-icon { font-size: 20px; line-height: 1; }
</style>
