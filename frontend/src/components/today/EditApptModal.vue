<script setup>
import { ref, computed } from 'vue'
import BaseModal from '../modal/BaseModal.vue'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/composables/useToast'

const props = defineProps({
  appointment: { type: Object, required: true },
  staff:       { type: Array,  default: () => [] },
  services:    { type: Array,  default: () => [] }  // catalogue complet
})
const emit = defineEmits(['close', 'refresh', 'encaisser'])

const { toast } = useToast()
const saving = ref(false)

const normOne = v => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

const appt = computed(() => props.appointment)

const clientName = computed(() => {
  const c = normOne(appt.value.client)
  return (((c?.name || '') + ' ' + (c?.last_name || '')).trim()) || appt.value.walkin_name || 'Client'
})

// ── Statut ──────────────────────────────────────────────────────────────────
const STATUSES = [
  { key: 'scheduled',   label: 'Planifié', cls: 'blue' },
  { key: 'in_progress', label: 'En cours', cls: 'green' },
  { key: 'completed',   label: 'Terminé',  cls: 'done' },
  { key: 'noshow',      label: 'No-show',  cls: 'red' },
  { key: 'cancelled',   label: 'Annulé',   cls: 'muted' },
]
const status = ref(appt.value.status || 'scheduled')

// ── Prestations existantes ───────────────────────────────────────────────────
const existingSvcs = computed(() =>
  (appt.value.appointment_services || [])
    .filter(as => as.status !== 'cancelled')
    .map(as => {
      const svc = normOne(as.service)
      const stf = normOne(as.staff)
      return { id: as.id, name: svc?.name || 'Prestation', price: as.price_at_booking, staffId: stf?.id || as.staff_id || null }
    })
)

const editPrices = ref(Object.fromEntries(existingSvcs.value.map(s => [s.id, s.price != null ? String(s.price) : ''])))
const editStaff  = ref(Object.fromEntries(existingSvcs.value.map(s => [s.id, s.staffId])))

const staffOptions = computed(() => [
  { id: null, name: 'Non assigné' },
  ...props.staff.map(sm => ({ id: sm.id, name: sm.name }))
])

function parsePrice(v) { const n = parseFloat(v); return isNaN(n) ? null : n }

// ── Ajouter une prestation ───────────────────────────────────────────────────
const newLines = ref([])  // [{ serviceId, staffId, price }]

function addLine() {
  newLines.value = [...newLines.value, { serviceId: null, staffId: null, price: '' }]
}

function removeLine(idx) {
  newLines.value = newLines.value.filter((_, i) => i !== idx)
}

const serviceOptions = computed(() =>
  props.services.filter(s => s.is_active !== false).map(s => ({ id: s.id, name: s.name, price: s.price }))
)

function onPickService(idx, serviceId) {
  const svc = props.services.find(s => s.id === serviceId)
  if (svc && newLines.value[idx].price === '') {
    newLines.value[idx].price = svc.price != null ? String(svc.price) : ''
  }
}

// ── Paiement (lecture seule — géré par EncaisserModal) ───────────────────────
const isPaid = computed(() => appt.value.payment_status === 'paid')

// ── Sauvegarde ───────────────────────────────────────────────────────────────
async function save() {
  saving.value = true
  try {
    // 1. Statut + paiement sur l'appointment
    const apptUpdate = { status: status.value }
    if (['completed', 'cancelled', 'noshow'].includes(status.value)) {
      apptUpdate.end_time = new Date().toISOString()
    }
    await supabase.from('appointments').update(apptUpdate).eq('id', appt.value.id)

    // 2. Mettre à jour les prestations existantes
    for (const svc of existingSvcs.value) {
      const updates = {}
      const newPrice = parsePrice(editPrices.value[svc.id])
      if (newPrice !== null && newPrice !== svc.price) updates.price_at_booking = newPrice
      const newStaffId = editStaff.value[svc.id] ?? null
      if (newStaffId !== svc.staffId) updates.staff_id = newStaffId
      if (Object.keys(updates).length) {
        await supabase.from('appointment_services').update(updates).eq('id', svc.id)
      }
    }

    // 3. Insérer les nouvelles prestations
    for (const line of newLines.value) {
      if (!line.serviceId) continue
      await supabase.from('appointment_services').insert({
        appointment_id: appt.value.id,
        service_id:     line.serviceId,
        staff_id:       line.staffId || null,
        price_at_booking: parsePrice(line.price),
        status:         'scheduled',
        start_time:     appt.value.start_time || null,
      })
    }

    toast.success('Modifications enregistrées ✓')
    emit('refresh')
    emit('close')
  } catch (e) {
    console.error(e)
    toast.error('Erreur lors de la sauvegarde')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseModal :title="`Modifier — ${clientName}`" @close="$emit('close')">
    <div class="modal-body edit-body">

      <!-- Statut -->
      <div class="edit-section">
        <label class="form-label">Statut</label>
        <div class="status-grid">
          <button
            v-for="s in STATUSES" :key="s.key"
            type="button"
            class="status-btn"
            :class="[`status-btn--${s.cls}`, { 'status-btn--active': status === s.key }]"
            @click="status = s.key"
          >{{ s.label }}</button>
        </div>
      </div>

      <div class="form-divider"></div>

      <!-- Prestations existantes -->
      <div class="edit-section">
        <label class="form-label">Prestations</label>
        <div class="svc-list">
          <div v-for="svc in existingSvcs" :key="svc.id" class="svc-row">
            <div class="svc-name">{{ svc.name }}</div>
            <div class="svc-controls">
              <select class="svc-staff-sel" v-model="editStaff[svc.id]">
                <option v-for="sm in staffOptions" :key="String(sm.id)" :value="sm.id">{{ sm.name }}</option>
              </select>
              <div class="price-wrap">
                <input v-model="editPrices[svc.id]" type="number" min="0" step="1" class="price-input" placeholder="0" />
                <span class="price-suffix">DH</span>
              </div>
            </div>
          </div>

          <!-- Nouvelles lignes -->
          <div v-for="(line, idx) in newLines" :key="'new-' + idx" class="svc-row svc-row--new">
            <div class="new-line-header">
              <span class="new-line-badge">+ Nouvelle</span>
              <button class="remove-btn" type="button" @click="removeLine(idx)" title="Retirer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <select class="svc-staff-sel" v-model="line.serviceId" @change="onPickService(idx, line.serviceId)">
              <option :value="null" disabled>Choisir une prestation…</option>
              <option v-for="s in serviceOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <div class="svc-controls">
              <select class="svc-staff-sel" v-model="line.staffId">
                <option v-for="sm in staffOptions" :key="String(sm.id)" :value="sm.id">{{ sm.name }}</option>
              </select>
              <div class="price-wrap">
                <input v-model="line.price" type="number" min="0" step="1" class="price-input" placeholder="0" />
                <span class="price-suffix">DH</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Bouton ajouter -->
        <button class="add-svc-btn" type="button" @click="addLine">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Ajouter une prestation
        </button>
      </div>

      <!-- Paiement : badge si payé, bouton Encaisser sinon -->
      <div v-if="isPaid" class="pay-done-badge">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        Payé
      </div>
      <button v-else type="button" class="enc-link" @click="emit('encaisser', appointment)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
        Encaisser →
      </button>

    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" @click="$emit('close')" :disabled="saving">Annuler</button>
      <button class="btn btn-primary" @click="save" :disabled="saving">
        {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
      </button>
    </div>
  </BaseModal>
</template>

<style scoped>
.edit-body { display: flex; flex-direction: column; gap: 14px; }
.edit-section { display: flex; flex-direction: column; gap: 8px; }

/* Statut */
.status-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.status-btn {
  padding: 5px 13px; border-radius: 99px;
  border: 1px solid var(--border); background: var(--bg-soft);
  font-size: 11.5px; font-weight: 600; color: var(--text-muted);
  cursor: pointer; font-family: inherit; transition: all .12s;
}
.status-btn--blue.status-btn--active   { background: rgba(147,197,253,.15); border-color: var(--blue); color: var(--blue); }
.status-btn--green.status-btn--active  { background: rgba(74,222,128,.12); border-color: var(--green); color: var(--green); }
.status-btn--done.status-btn--active   { background: rgba(0,0,0,.07); border-color: var(--border-strong); color: var(--text-muted); }
.status-btn--red.status-btn--active    { background: rgba(248,113,113,.1); border-color: var(--red); color: var(--red); }
.status-btn--muted.status-btn--active  { background: rgba(0,0,0,.06); border-color: var(--border-strong); color: var(--text-light); }
.status-btn:hover:not(.status-btn--active) { border-color: var(--border-strong); color: var(--text-main); }

/* Prestations */
.svc-list { display: flex; flex-direction: column; gap: 0; }
.svc-row {
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 0; border-bottom: 1px solid var(--border);
}
.svc-row:last-child { border-bottom: none; }
.svc-row--new { background: var(--primary-soft); border-radius: 8px; padding: 10px; border: 1px dashed var(--primary-mid); margin-top: 4px; }
.svc-row--new:last-child { border-bottom: 1px dashed var(--primary-mid); }

.new-line-header { display: flex; align-items: center; justify-content: space-between; }
.new-line-badge { font-size: 10px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: .05em; }
.remove-btn {
  width: 22px; height: 22px; border-radius: 5px; border: none;
  background: transparent; color: var(--text-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: all .12s;
}
.remove-btn:hover { background: var(--red-soft); color: var(--red); }

.svc-name { font-size: 13px; font-weight: 700; color: var(--text-main); }
.svc-controls { display: flex; gap: 8px; align-items: center; }
.svc-staff-sel {
  flex: 1; padding: 6px 10px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--bg-soft);
  font-size: 12px; font-weight: 600; color: var(--text-main);
  font-family: inherit; cursor: pointer;
}
.svc-staff-sel:focus { outline: none; border-color: var(--primary); }

.price-wrap { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.price-input {
  width: 72px; padding: 6px 8px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--bg-soft);
  font-size: 13px; font-weight: 700; color: var(--text-main);
  font-family: inherit; text-align: right;
}
.price-input:focus { outline: none; border-color: var(--primary); }
.price-suffix { font-size: 12px; font-weight: 700; color: var(--text-muted); }

/* Bouton ajouter */
.add-svc-btn {
  display: flex; align-items: center; gap: 7px;
  padding: 7px 13px; border-radius: 9px; margin-top: 4px;
  border: 1px dashed var(--primary-mid); background: transparent;
  color: var(--primary); font-size: 12px; font-weight: 700;
  font-family: inherit; cursor: pointer; transition: all .12s;
}
.add-svc-btn:hover { background: var(--primary-soft); border-style: solid; }

/* Paiement */
.pay-done-badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 99px;
  background: rgba(74,222,128,.12); border: 1px solid rgba(21,128,61,.25);
  color: var(--green); font-size: 12px; font-weight: 700;
}
.enc-link {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 7px 14px; border-radius: 9px;
  background: var(--primary-soft); border: 1px solid var(--primary-mid);
  color: var(--primary); font-size: 12px; font-weight: 700;
  font-family: inherit; cursor: pointer; transition: all .12s;
}
.enc-link:hover { background: var(--primary); color: #fff; }
</style>
