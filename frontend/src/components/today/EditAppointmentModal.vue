<script setup>
import { ref, computed, watch } from 'vue'
import BaseModal from '../modal/BaseModal.vue'
import CustomSelect from '../common/CustomSelect.vue'
import { supabase } from '@/lib/supabase'

// ── Confirmation inline (remplace window.confirm) ─────────────────────────────
const pendingConfirm = ref(null) // { message, resolve }
function askConfirm(message) {
  return new Promise(resolve => { pendingConfirm.value = { message, resolve } })
}
function resolveConfirm(ok) {
  pendingConfirm.value?.resolve(ok)
  pendingConfirm.value = null
}

const props = defineProps({
  appointment: { type: Object, required: true },
  staff:       { type: Array, default: () => [] },
  services:    { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'refresh'])

const apptId = props.appointment.id

function localNowIso() {
  return new Date().toISOString()
}

// ── Lignes locales ────────────────────────────────────────────────────────────
const rawSvcs = props.appointment.raw?.appointment_services || []

const lines = ref(
  rawSvcs.length
    ? rawSvcs.map(s => ({
        id:               s.id,
        serviceId:        s.service?.id ?? s.service_id ?? null,
        staffId:          s.staff?.id   ?? s.staff_id   ?? null,
        price_at_booking: s.price_at_booking ?? s.service?.price ?? null,
        status:           s.status ?? 'active',
        _new:             false,
        _saving:          false
      }))
    : [{ id: null, serviceId: null, staffId: props.appointment.raw?.staff_id ?? null, price_at_booking: null, status: 'active', _new: true, _saving: false }]
)

const focusedSvcId = props.appointment.svcId
const isSaving     = ref(false)

// ── Règle de statut ───────────────────────────────────────────────────────────
function isActive(l) { return l.status !== 'cancelled' }

function statusLabel(line) {
  if (line.status === 'completed') return 'Terminé'
  if (line.status === 'cancelled') return 'Annulé'
  return 'En cours'
}

function computeApptStatus(lineList) {
  if (!lineList.length) return 'cancelled'   // plus aucune prestation → annulé
  if (lineList.every(l => l.status === 'cancelled')) return 'cancelled'
  if (lineList.every(l => l.status === 'completed' || l.status === 'cancelled')) return 'completed'
  return 'in_progress'
}

// ── Actions de statut IMMÉDIATES (sauvegardent en base directement) ───────────
async function reactivateLine(line) {
  const svcId = line.id
  if (!svcId) return
  const idx = lines.value.findIndex(l => l.id === svcId)
  try {
    const { data, error } = await supabase
      .from('appointment_services')
      .update({ status: 'active' })
      .eq('id', svcId)
      .select('id, status')
    if (error) throw error
    if (idx !== -1) {
      lines.value[idx] = { ...lines.value[idx], status: 'active', _saving: false }
    }
    await refreshApptStatus()
    emit('refresh')
  } catch (e) {
    console.error('Erreur réactivation:', e)
    alert('Erreur : ' + (e.message || JSON.stringify(e)))
  }
}

async function cancelLine(line) {
  line._saving = true
  try {
    const { error } = await supabase
      .from('appointment_services')
      .update({ status: 'cancelled' })
      .eq('id', line.id)
    if (error) throw error
    line.status = 'cancelled'
    await refreshApptStatus()
    emit('refresh')
  } catch (e) {
    console.error('Erreur annulation:', e)
    alert('Erreur lors de l\'annulation')
  } finally {
    line._saving = false
  }
}

// ── Resync du statut appointment depuis la DB ─────────────────────────────────
async function refreshApptStatus() {
  const { data: svcs } = await supabase
    .from('appointment_services')
    .select('id, status')
    .eq('appointment_id', apptId)
  const newStatus = computeApptStatus(svcs || [])
  const update = { status: newStatus }
  if (newStatus === 'cancelled' || newStatus === 'completed') update.end_time = localNowIso()
  await supabase.from('appointments').update(update).eq('id', apptId)
}

// ── Enregistrer (service + collaborateur uniquement) ─────────────────────────
async function handleSave() {
  isSaving.value = true
  try {
    for (const line of lines.value) {
      if (line._new) {
        if (line.serviceId) {
          const { error } = await supabase.from('appointment_services').insert({
            appointment_id:   apptId,
            service_id:       line.serviceId,
            staff_id:         line.staffId || null,
            price_at_booking: line.price_at_booking != null ? Number(line.price_at_booking) : null
          })
          if (error) throw error
        }
      } else if (line.status !== 'cancelled') {
        // Ne pas écraser les lignes annulées
        const { error } = await supabase.from('appointment_services').update({
          service_id:       line.serviceId,
          staff_id:         line.staffId || null,
          price_at_booking: line.price_at_booking != null ? Number(line.price_at_booking) : null
        }).eq('id', line.id)
        if (error) throw error
      }
    }
    await refreshApptStatus()
    emit('refresh')
    emit('close')
  } catch (e) {
    console.error('Erreur sauvegarde:', e)
    alert('Erreur lors de la mise à jour')
  } finally {
    isSaving.value = false
  }
}

// ── Annuler tout ──────────────────────────────────────────────────────────────
async function handleCancelAll() {
  const ok = await askConfirm('Voulez-vous vraiment annuler ce rendez-vous ?')
  if (!ok) return
  isSaving.value = true
  try {
    await supabase.from('appointment_services')
      .update({ status: 'cancelled' })
      .eq('appointment_id', apptId)
    await supabase.from('appointments')
      .update({ status: 'cancelled', end_time: localNowIso() })
      .eq('id', apptId)
    lines.value.forEach(l => { l.status = 'cancelled' })
    emit('refresh')
    emit('close')
  } catch (e) {
    console.error(e)
  } finally {
    isSaving.value = false
  }
}

// ── Réactiver tout ────────────────────────────────────────────────────────────
async function handleReactivateAll() {
  isSaving.value = true
  try {
    await supabase.from('appointment_services')
      .update({ status: 'active' })
      .eq('appointment_id', apptId)
      .eq('status', 'cancelled')
    await supabase.from('appointments')
      .update({ status: 'in_progress' })
      .eq('id', apptId)
    lines.value.forEach(l => { if (l.status === 'cancelled') l.status = 'active' })
    emit('refresh')
    emit('close')
  } catch (e) {
    console.error(e)
  } finally {
    isSaving.value = false
  }
}

// ── Supprimer une ligne ───────────────────────────────────────────────────────
async function deleteLine(line, idx) {
  const ok = await askConfirm('Supprimer définitivement cette prestation ?')
  if (!ok) return
  line._saving = true
  try {
    if (line.id) {
      const { error } = await supabase.from('appointment_services').delete().eq('id', line.id)
      if (error) throw error
    }
    lines.value.splice(idx, 1)

    // Relire la DB pour avoir l'état réel des services restants
    const { data: remaining, error: remErr } = await supabase
      .from('appointment_services')
      .select('id, status')
      .eq('appointment_id', apptId)

    // Si la requête échoue, ne pas supprimer l'appointment — lever l'erreur
    if (remErr) throw remErr

    if (!remaining || remaining.length === 0) {
      const { error: apptErr } = await supabase.from('appointments').delete().eq('id', apptId)
      if (apptErr) throw apptErr
    } else {
      const newStatus = computeApptStatus(remaining)
      const update = { status: newStatus }
      if (newStatus === 'cancelled' || newStatus === 'completed') update.end_time = localNowIso()
      const { error: apptErr } = await supabase.from('appointments').update(update).eq('id', apptId)
      if (apptErr) throw apptErr
    }

    emit('refresh')
    emit('close')
  } catch (e) {
    console.error('Erreur suppression:', e)
    alert('Erreur : ' + (e.message || JSON.stringify(e)))
  } finally {
    line._saving = false   // toujours réinitialiser
  }
}

// ── Auto-remplir le prix depuis le catalogue quand on change de prestation ────
watch(
  () => lines.value.map(l => l.serviceId),
  (newIds, oldIds) => {
    newIds.forEach((id, i) => {
      if (id && id !== oldIds?.[i]) {
        const svc = props.services.find(s => s.id === id)
        if (svc?.price != null) lines.value[i].price_at_booking = svc.price
      }
    })
  }
)

// ── Ajouter une ligne ─────────────────────────────────────────────────────────
function addLine() {
  lines.value.push({ id: null, serviceId: null, staffId: null, price_at_booking: null, status: 'active', _new: true, _saving: false })
}

// ── Computed ──────────────────────────────────────────────────────────────────
const allCancelled = computed(() =>
  lines.value.length > 0 && lines.value.every(l => l.status === 'cancelled')
)
const canCancelAll = computed(() => !props.appointment.isWalkin && lines.value.some(isActive))
</script>

<template>
  <BaseModal @close="$emit('close')">
    <header class="modal-title">Modifier le rendez-vous</header>

    <div class="modal-body">
      <!-- Info client -->
      <div class="client-banner">
        <div class="client-avatar">{{ appointment.client?.charAt(0)?.toUpperCase() || '?' }}</div>
        <div>
          <div class="client-name">{{ appointment.client }}</div>
          <div class="client-meta">{{ appointment.time }}</div>
        </div>
      </div>

      <!-- Liste des prestations -->
      <div class="svcs-section">
        <div class="svcs-header">
          <span>Prestations</span>
          <button type="button" class="add-line-btn" @click="addLine">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Ajouter
          </button>
        </div>

        <div class="svcs-list">
          <div
            v-for="(line, idx) in lines"
            :key="line.id ?? 'new-' + idx"
            class="svc-row"
            :class="{
              'row-cancelled': line.status === 'cancelled',
              'row-completed': line.status === 'completed',
              'row-focused':   line.id && line.id === focusedSvcId
            }"
          >
            <div class="row-num">{{ idx + 1 }}</div>

            <div class="row-fields">
              <CustomSelect
                v-model="line.serviceId"
                :options="services"
                placeholder="Prestation…"
                :iconType="'none'"
                class="field-service"
                :disabled="!isActive(line)"
              />
              <CustomSelect
                v-model="line.staffId"
                :options="[{ id: null, name: 'Non assigné' }, ...staff]"
                placeholder="Collaborateur…"
                :iconType="'none'"
                class="field-staff"
                :disabled="!isActive(line)"
              />
              <div class="field-price-wrap">
                <input
                  v-model="line.price_at_booking"
                  type="number" min="0" step="1"
                  placeholder="Prix"
                  class="field-price"
                  :disabled="!isActive(line)"
                />
                <span class="field-price-suffix">DH</span>
              </div>
            </div>

            <!-- Badge statut -->
            <span class="status-badge"
              :class="line.status === 'completed' ? 'status-badge--done' : line.status === 'cancelled' ? 'status-badge--cancelled' : 'status-badge--active'">
              {{ statusLabel(line) }}
            </span>

            <!-- Actions ligne (immédiates) -->
            <div class="row-actions">
              <button
                v-if="line.status === 'cancelled'"
                type="button"
                class="btn-reactivate-line"
                :disabled="line._saving"
                title="Réactiver cette prestation"
                @click="reactivateLine(line)"
              >
                <svg v-if="!line._saving" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.98"/></svg>
                <span v-else class="mini-spin"></span>
              </button>
              <button
                v-else-if="line.status !== 'completed'"
                type="button"
                class="btn-cancel-line"
                :disabled="line._saving"
                title="Annuler cette prestation"
                @click="cancelLine(line)"
              >
                <svg v-if="!line._saving" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                <span v-else class="mini-spin"></span>
              </button>

              <button
                type="button"
                class="btn-delete-line"
                :disabled="line._saving"
                title="Supprimer cette prestation"
                @click="deleteLine(line, idx)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-actions" style="justify-content: space-between;">
      <div style="display:flex;gap:8px;">
        <button v-if="allCancelled" class="btn btn-reactivate" @click="handleReactivateAll" :disabled="isSaving">
          ↺ Réactiver tout
        </button>
        <button v-else-if="canCancelAll" class="btn btn-danger-outline" @click="handleCancelAll" :disabled="isSaving">
          Annuler le RDV
        </button>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary" @click="$emit('close')">Fermer</button>
        <button class="btn btn-primary" :disabled="isSaving" @click="handleSave">
          {{ isSaving ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>
    </div>
    <!-- Confirmation inline (remplace window.confirm) -->
    <BaseModal v-if="pendingConfirm" @close="resolveConfirm(false)">
      <header class="modal-title">Confirmation</header>
      <div class="modal-body">
        <p style="font-size:13.5px;color:var(--text-main);line-height:1.6">{{ pendingConfirm.message }}</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="resolveConfirm(false)">Annuler</button>
        <button class="btn btn-primary btn-warning-solid" @click="resolveConfirm(true)">Confirmer</button>
      </div>
    </BaseModal>
  </BaseModal>
</template>

<style scoped>
.client-banner {
  display: flex; align-items: center; gap: 14px;
  padding: 14px; background: var(--bg-main);
  border: 1px solid var(--border); border-radius: 10px; margin-bottom: 12px;
}
.client-avatar {
  width: 44px; height: 44px; border-radius: 50%;
  background: var(--primary-soft); color: var(--primary-text);
  font-size: 18px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.client-name { font-size: 15px; font-weight: 600; color: var(--text-main); }
.client-meta { font-size: 12.5px; color: var(--text-muted); margin-top: 2px; }

.svcs-section { display: flex; flex-direction: column; gap: 8px; }

.svcs-header {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; color: var(--text-muted);
}

.add-line-btn {
  display: flex; align-items: center; gap: 5px;
  border: 1.5px dashed var(--border); background: transparent;
  border-radius: 7px; padding: 4px 10px;
  font-size: 12px; font-weight: 600; color: var(--text-muted);
  cursor: pointer; transition: all .12s; text-transform: none; letter-spacing: 0;
}
.add-line-btn:hover { border-color: var(--primary); color: var(--primary); background: #eff6ff; }

.svcs-list { display: flex; flex-direction: column; gap: 6px; }

.svc-row {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border: 1.5px solid var(--border);
  border-radius: 10px; background: var(--bg-soft); transition: border-color .15s;
}
.svc-row.row-focused   { border-color: var(--primary); background: var(--primary-soft); }
.svc-row.row-cancelled { opacity: .6; background: var(--red-soft); border-color: rgba(220,38,38,.3); }
.svc-row.row-completed { background: var(--green-soft); border-color: rgba(21,128,61,.25); }

.row-num {
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--primary-soft); color: var(--primary-text);
  font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}

.row-fields { display: flex; gap: 8px; flex: 1; min-width: 0; align-items: center; }
.field-service { flex: 2; min-width: 0; }
.field-staff   { flex: 2; min-width: 0; }
.field-price-wrap { position: relative; width: 90px; flex-shrink: 0; }
.field-price {
  width: 100%; padding: 7px 26px 7px 10px;
  border: 1px solid var(--border); border-radius: 8px;
  font-size: 13px; color: var(--text-main); background: var(--bg-main);
  font-family: inherit; height: 100%;
}
.field-price:focus { outline: none; border-color: var(--primary); }
.field-price:disabled { opacity: 0.5; }
.field-price-suffix {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  font-size: 11px; color: var(--text-muted); pointer-events: none;
}

.status-badge {
  font-size: 10.5px; font-weight: 700; white-space: nowrap; flex-shrink: 0;
  padding: 3px 8px; border-radius: 999px;
}
.status-badge--active    { background: var(--primary-soft);  color: var(--primary); border: 1px solid rgba(168,129,10,.2); }
.status-badge--done      { background: var(--green-soft);    color: var(--green);   border: 1px solid rgba(21,128,61,.2); }
.status-badge--cancelled { background: var(--red-soft);      color: var(--red);     border: 1px solid rgba(220,38,38,.2); }

.row-actions { flex-shrink: 0; display: flex; align-items: center; }

.btn-cancel-line, .btn-reactivate-line {
  width: 28px; height: 28px; border-radius: 7px; border: 1.5px solid;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  background: transparent; transition: all .12s;
}
.btn-cancel-line:disabled, .btn-reactivate-line:disabled, .btn-delete-line:disabled { opacity: .5; cursor: not-allowed; }
.btn-cancel-line      { border-color: rgba(220,38,38,.3); color: var(--red); }
.btn-cancel-line:hover:not(:disabled) { background: var(--red-soft); }
.btn-reactivate-line      { border-color: rgba(21,128,61,.3); color: var(--green); }
.btn-reactivate-line:hover:not(:disabled) { background: var(--green-soft); }
.btn-delete-line {
  width: 28px; height: 28px; border-radius: 7px; border: 1.5px solid var(--border-strong);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  background: transparent; color: var(--text-light); transition: all .12s; margin-left: 2px;
}
.btn-delete-line:hover:not(:disabled) { border-color: #fca5a5; color: #dc2626; background: #fff5f5; }

.mini-spin {
  display: inline-block; width: 10px; height: 10px;
  border: 2px solid currentColor; border-top-color: transparent;
  border-radius: 50%; animation: spin .6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.btn-danger-outline {
  background: transparent; border: 1px solid #fca5a5; color: #dc2626;
  padding: 0 16px; height: 38px; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s;
}
.btn-danger-outline:hover { background: #fee2e2; }

.btn-reactivate {
  background: transparent; border: 1px solid #86efac; color: #16a34a;
  padding: 0 16px; height: 38px; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s;
}
.btn-reactivate:hover { background: #dcfce7; }

.btn-warning-solid {
  background: #dc2626; border-color: #dc2626; color: #fff;
}
.btn-warning-solid:hover { background: #b91c1c; }

/* Élargir la modale pour avoir de la place */
:deep(.modal) { width: 600px; }

@media (max-width: 620px) {
  :deep(.modal) { width: 100%; }
  .row-fields { flex-direction: column; }
  .field-price-wrap { width: 100%; }
}
</style>
