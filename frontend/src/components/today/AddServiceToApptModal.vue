<script setup>
import { ref, computed } from 'vue'
import BaseModal from '../modal/BaseModal.vue'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/composables/useToast'

const props = defineProps({
  appointment: { type: Object, required: true }, // appointment complet (raw)
  staff:       { type: Array,  default: () => [] },
  services:    { type: Array,  default: () => [] },
})
const emit = defineEmits(['close', 'refresh'])

const { toast } = useToast()
const saving = ref(false)

const normOne = v => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

const clientName = computed(() => {
  const c = normOne(props.appointment.client)
  return (((c?.name || '') + ' ' + (c?.last_name || '')).trim()) || props.appointment.walkin_name || 'Client'
})

const isPaid = computed(() => props.appointment.payment_status === 'paid')

// ── Formulaire ───────────────────────────────────────────────────────────────
const selectedServiceId = ref(null)
const selectedStaffId   = ref(null)
const price             = ref('')

const serviceOptions = computed(() =>
  props.services.filter(s => s.is_active !== false)
)

const staffOptions = computed(() => [
  { id: null, name: 'Non assigné' },
  ...props.staff.map(sm => ({ id: sm.id, name: sm.name }))
])

function onPickService(id) {
  const svc = props.services.find(s => s.id === id)
  if (svc && price.value === '') price.value = svc.price != null ? String(svc.price) : ''
}

function parsePrice(v) { const n = parseFloat(v); return isNaN(n) ? null : n }

const canSubmit = computed(() => !!selectedServiceId.value)

// ── Sauvegarde ───────────────────────────────────────────────────────────────
async function save() {
  if (!canSubmit.value) return
  saving.value = true
  try {
    const nowIso = new Date().toISOString()
    const appt   = props.appointment

    if (!isPaid.value) {
      // ── Cas 1 : pas encore encaissé → ajouter au même appointment ──────────
      const { error: svcErr } = await supabase.from('appointment_services').insert({
        appointment_id:    appt.id,
        service_id:        selectedServiceId.value,
        staff_id:          selectedStaffId.value || null,
        price_at_booking:  parsePrice(price.value),
        status:            'scheduled',
        start_time:        nowIso,
      })
      if (svcErr) throw svcErr
      // S'assurer que l'appointment est bien in_progress
      if (!['in_progress', 'scheduled', 'confirmed'].includes(appt.status)) {
        const { error: stErr } = await supabase.from('appointments').update({ status: 'in_progress' }).eq('id', appt.id)
        if (stErr) throw stErr
      }
      toast.success('Prestation ajoutée au RDV en cours')
    } else {
      // ── Cas 2 : déjà encaissé → nouvel appointment indépendant ─────────────
      const clientId   = appt.client_id || normOne(appt.client)?.id || null
      const walkinName = appt.walkin_name || null

      const { data: newAppt, error: apptErr } = await supabase
        .from('appointments')
        .insert({
          organization_id: appt.organization_id,
          client_id:       clientId,
          walkin_name:     walkinName,
          type:            clientId ? 'appointment' : 'walkin',
          status:          'in_progress',
          start_time:      nowIso,
          payment_status:  'pending',
        })
        .select('id')
        .single()

      if (apptErr) throw apptErr

      const { error: svcErr2 } = await supabase.from('appointment_services').insert({
        appointment_id:   newAppt.id,
        service_id:       selectedServiceId.value,
        staff_id:         selectedStaffId.value || null,
        price_at_booking: parsePrice(price.value),
        status:           'scheduled',
        start_time:       nowIso,
      })
      if (svcErr2) throw svcErr2
      toast.success('Nouvelle prestation créée — encaissement séparé')
    }

    emit('refresh')
    emit('close')
  } catch (e) {
    console.error(e)
    toast.error('Erreur lors de l\'ajout')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseModal :title="`Ajouter une prestation — ${clientName}`" @close="$emit('close')">
    <div class="modal-body add-svc-body">

      <!-- Contexte groupement -->
      <div class="group-info" :class="isPaid ? 'group-info--separate' : 'group-info--grouped'">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle v-if="isPaid" cx="12" cy="12" r="10"/><line v-if="isPaid" x1="12" y1="8" x2="12" y2="12"/><line v-if="isPaid" x1="12" y1="16" x2="12.01" y2="16"/>
          <polyline v-else points="20 6 9 17 4 12"/>
        </svg>
        <span v-if="isPaid">
          RDV encaissé — la prestation sera <strong>un nouvel encaissement séparé</strong>
        </span>
        <span v-else>
          RDV non encaissé — la prestation sera <strong>groupée</strong> avec ce RDV
        </span>
      </div>

      <!-- Prestation -->
      <div class="field">
        <label class="form-label">Prestation</label>
        <select class="field-select" v-model="selectedServiceId" @change="onPickService(selectedServiceId)">
          <option :value="null" disabled>Choisir une prestation…</option>
          <option v-for="s in serviceOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>

      <!-- Staff -->
      <div class="field">
        <label class="form-label">Collaborateur</label>
        <select class="field-select" v-model="selectedStaffId">
          <option v-for="sm in staffOptions" :key="String(sm.id)" :value="sm.id">{{ sm.name }}</option>
        </select>
      </div>

      <!-- Prix -->
      <div class="field">
        <label class="form-label">Prix</label>
        <div class="price-wrap">
          <input v-model="price" type="number" min="0" step="1" class="price-input" placeholder="0" />
          <span class="price-suffix">DH</span>
        </div>
      </div>

    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" @click="$emit('close')" :disabled="saving">Annuler</button>
      <button class="btn btn-primary" :disabled="!canSubmit || saving" @click="save">
        {{ saving ? 'Ajout…' : 'Ajouter' }}
      </button>
    </div>
  </BaseModal>
</template>

<style scoped>
.add-svc-body { display: flex; flex-direction: column; gap: 14px; }

.group-info {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 13px; border-radius: 10px;
  font-size: 12.5px; line-height: 1.5;
}
.group-info--grouped  { background: rgba(74,222,128,.08); border: 1px solid rgba(21,128,61,.2); color: var(--green); }
.group-info--separate { background: rgba(168,129,10,.08); border: 1px solid var(--primary-mid); color: var(--primary); }
.group-info svg { flex-shrink: 0; margin-top: 1px; }
.group-info strong { font-weight: 700; }

.field { display: flex; flex-direction: column; gap: 6px; }
.field-select {
  width: 100%; padding: 8px 11px; border-radius: 9px;
  border: 1px solid var(--border); background: var(--bg-soft);
  font-size: 13px; font-weight: 600; color: var(--text-main);
  font-family: inherit; cursor: pointer;
}
.field-select:focus { outline: none; border-color: var(--primary); }

.price-wrap { display: flex; align-items: center; gap: 6px; }
.price-input {
  width: 100px; padding: 8px 10px; border-radius: 9px;
  border: 1px solid var(--border); background: var(--bg-soft);
  font-size: 14px; font-weight: 700; color: var(--text-main);
  font-family: inherit; text-align: right;
}
.price-input:focus { outline: none; border-color: var(--primary); }
.price-suffix { font-size: 13px; font-weight: 700; color: var(--text-muted); }
</style>
