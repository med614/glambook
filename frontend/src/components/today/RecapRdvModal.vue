<script setup>
import { ref, computed } from 'vue'
import BaseModal from '../modal/BaseModal.vue'
import CustomSelect from '@/components/common/CustomSelect.vue'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/composables/useToast'

const props = defineProps({
  appointment: { type: Object, required: true },
  staff:        { type: Array,  default: () => [] },
  services:     { type: Array,  default: () => [] }
})

const isWalkin = computed(() => props.appointment.type === 'walkin')
const emit = defineEmits(['close', 'refresh', 'serve', 'finish', 'encaisser'])

const { toast } = useToast()
const isSaving = ref(false)
const editingStaffSvcId  = ref(null)
const editingStaffNewId  = ref(null)
const pendingFinishId    = ref(null)
let   pendingFinishTimer = null
const localCompletedIds  = ref(new Set())

// ── Paiement (lecture seule) ──────────────────────────────────────────────────
const isPaid       = computed(() => props.appointment.payment_status === 'paid')
const paymentMethod = computed(() => props.appointment.payment_method || null)
const METHOD_LABELS = { cash: '💵 Espèces', card: '💳 Carte' }

const isPayable = computed(() => {
  const svcs = allServices.value.filter(s => s.status !== 'cancelled')
  return svcs.length > 0 && svcs.every(s => s.status === 'completed') && !isPaid.value
})

function askFinish(svc) {
  if (pendingFinishId.value === svc.svcId) {
    clearTimeout(pendingFinishTimer)
    pendingFinishId.value = null
    finishService(svc)
  } else {
    clearTimeout(pendingFinishTimer)
    pendingFinishId.value = svc.svcId
    pendingFinishTimer = setTimeout(() => { pendingFinishId.value = null }, 3000)
  }
}

const clientName = computed(() => {
  const c = props.appointment.client
  if (!c) return props.appointment.walkin_name || 'Inconnu'
  return ((c.name || '') + ' ' + (c.last_name || '')).trim() || 'Inconnu'
})

const arrivalTime = computed(() => isoToLocalHHMM(props.appointment.start_time) || '--:--')

const waitMinutes = computed(() => {
  const start = props.appointment.start_time
  if (!start) return null
  const diff = Math.floor((Date.now() - new Date(start).getTime()) / 60000)
  return diff > 0 ? diff : 0
})

const allServices = computed(() =>
  (props.appointment.appointment_services || []).map(as => ({
    svcId:       as.id,
    serviceId:   as.service?.id || null,
    serviceName: as.service?.name || 'Prestation à définir',
    duration:    as.service?.duration_minutes || null,
    startTime:   isoToLocalHHMM(as.start_time || props.appointment.start_time),
    staffName:   as.staff?.name || null,
    staffId:     as.staff?.id || as.staff_id || null,
    price:       as.price_at_booking,
    status:      localCompletedIds.value.has(as.id) ? 'completed' : (as.status || 'active'),
    isParallel:  as.is_parallel || false
  }))
)

function statusLabel(svc) {
  if (svc.status === 'completed') return 'Terminé'
  if (svc.status === 'cancelled') return 'Annulé'
  if (svc.staffId) return 'En cours'
  return 'En attente'
}

function statusClass(svc) {
  if (svc.status === 'completed') return 'badge--done'
  if (svc.status === 'cancelled') return 'badge--cancelled'
  if (svc.staffId) return 'badge--inprogress'
  return 'badge--waiting'
}

function canServe(svc) {
  return svc.status === 'active' && !svc.staffId
}

function canChangeStaff(svc) {
  return svc.status === 'active' && svc.staffId
}

const totalPrice = computed(() => {
  const items = allServices.value.filter(s => s.status !== 'cancelled')
  const prices = items.map(s => s.price)
  if (prices.every(p => p == null)) return null
  return prices.reduce((sum, p) => sum + (p ?? 0), 0)
})

const staffOptions = computed(() => [
  { id: null, name: 'Non assigné' },
  ...props.staff.filter(s => s.is_active !== false).map(s => ({ id: s.id, name: s.name }))
])

function startEditStaff(svc) {
  editingStaffSvcId.value = svc.svcId
  editingStaffNewId.value = svc.staffId
}

async function saveStaff(svc) {
  isSaving.value = true
  try {
    await supabase.from('appointment_services')
      .update({ staff_id: editingStaffNewId.value || null })
      .eq('id', svc.svcId)
    editingStaffSvcId.value = null
    emit('refresh')
    emit('close')
    toast.success('Collaborateur modifié')
  } catch (e) { console.error(e); toast.error('Erreur lors du changement de collaborateur') } finally { isSaving.value = false }
}

function localNowIso() {
  return new Date().toISOString()
}

const isoToLocalHHMM = iso => {
  if (!iso) return ''
  const d = new Date(iso)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

function apptStatusFromSvcs(svcs) {
  if (!svcs.length) return 'cancelled'
  if (svcs.every(s => s.status === 'cancelled')) return 'cancelled'
  if (svcs.every(s => s.status === 'completed' || s.status === 'cancelled')) return 'completed'
  return 'in_progress'
}

async function finishService(svc) {
  if (!isWalkin.value) {
    // RDV planifié : déléguer à Today.vue (shiftCascadeFrom + mise à jour selectedRecapAppt)
    // NE PAS émettre 'close' — onRecapFinish décide si le modal reste ouvert pour le paiement
    emit('finish', { apptId: props.appointment.id, svcId: svc.svcId })
    return
  }
  // Walkin : traitement local
  isSaving.value = true
  try {
    await supabase.from('appointment_services').update({ status: 'completed' }).eq('id', svc.svcId)
    const { data: svcs } = await supabase.from('appointment_services').select('id, status').eq('appointment_id', props.appointment.id)
    const updated = (svcs || []).map(s => s.id === svc.svcId ? { ...s, status: 'completed' } : s)
    const newStatus = apptStatusFromSvcs(updated)
    const update = { status: newStatus }
    if (newStatus === 'completed' || newStatus === 'cancelled') update.end_time = localNowIso()
    await supabase.from('appointments').update(update).eq('id', props.appointment.id)
    const allDone = updated.every(s => s.status === 'completed' || s.status === 'cancelled')
    emit('refresh')
    toast.success('Prestation terminée ✓')
    if (allDone) {
      // Mettre à jour allServices localement pour déclencher isPayable
      localCompletedIds.value.add(svc.svcId)
    } else {
      emit('close')
    }
  } catch (e) { console.error(e); toast.error('Erreur lors de la finalisation') } finally { isSaving.value = false }
}


const confirmCancel = ref(false)

async function deleteAll() {
  isSaving.value = true
  try {
    await supabase.from('appointment_services').delete().eq('appointment_id', props.appointment.id)
    await supabase.from('appointments').delete().eq('id', props.appointment.id)
    confirmCancel.value = false
    emit('refresh')
    emit('close')
    toast.success('Client supprimé')
  } catch (e) { console.error(e); toast.error('Erreur lors de la suppression') } finally { isSaving.value = false }
}

function serveService(svc) {
  emit('serve', { appointment: props.appointment, service: svc })
  emit('close')
}

async function deleteService(svc) {
  isSaving.value = true
  try {
    const { data: allSvcs } = await supabase.from('appointment_services').select('id').eq('appointment_id', props.appointment.id)
    await supabase.from('appointment_services').delete().eq('id', svc.svcId)
    if ((allSvcs || []).length <= 1) {
      await supabase.from('appointments').delete().eq('id', props.appointment.id)
    }
    emit('refresh')
    emit('close')
  } catch (e) { console.error(e) } finally { isSaving.value = false }
}
</script>

<template>
  <BaseModal :title="clientName" @close="$emit('close')">

    <!-- Sous-titre : heure + attente -->
    <div class="recap-meta">
      <span v-if="appointment.status === 'noshow'"    class="recap-status recap-status--noshow">No show</span>
      <span v-else-if="appointment.status === 'cancelled'" class="recap-status recap-status--cancelled">Annulé</span>
      <template v-else>
        <span class="recap-arrival">Arrivée {{ arrivalTime }}</span>
        <span v-if="waitMinutes !== null" class="recap-wait">· {{ waitMinutes }} min en attente</span>
        <span v-if="appointment.status === 'completed'"   class="recap-status recap-status--done">Terminé</span>
        <span v-else-if="appointment.status === 'in_progress'" class="recap-status recap-status--inprogress">En cours</span>
      </template>
      <span v-if="isWalkin" class="recap-tag">Sans RDV</span>
    </div>

    <div class="modal-body">

      <!-- Services list -->
      <div class="svcs-list">
        <div
          v-for="svc in allServices"
          :key="svc.svcId"
          class="svc-row"
          :class="{
            'svc-row--waiting':    canServe(svc),
            'svc-row--inprogress': svc.status === 'active' && svc.staffId,
            'svc-row--done':       svc.status === 'completed',
            'svc-row--cancelled':  svc.status === 'cancelled'
          }"
        >
          <!-- Indicateur statut -->
          <div class="svc-indicator">
            <svg v-if="svc.status === 'completed'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            <span v-else-if="svc.status === 'active' && svc.staffId" class="dot dot--green"></span>
            <span v-else class="dot dot--orange"></span>
          </div>

          <!-- Corps -->
          <div class="svc-body">
            <div class="svc-name">
              {{ svc.serviceName }}
              <span v-if="svc.isParallel" class="badge-parallel">⟺</span>
            </div>
            <div class="svc-detail">
              <span v-if="svc.duration" class="svc-dur">{{ svc.duration }} min</span>
              <template v-if="editingStaffSvcId === svc.svcId">
                <CustomSelect v-model="editingStaffNewId" :options="staffOptions" placeholder="Staff…" :iconType="'none'" style="min-width:130px;font-size:12px;" />
                <button class="btn-xs btn-xs--gold" @click="saveStaff(svc)" :disabled="isSaving">✓</button>
                <button class="btn-xs btn-xs--ghost" @click="editingStaffSvcId = null" :disabled="isSaving">✕</button>
              </template>
              <template v-else>
                <button v-if="canChangeStaff(svc)" class="staff-chip" @click="startEditStaff(svc)" :disabled="isSaving">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                  {{ svc.staffName }}
                </button>
                <span v-else-if="svc.staffName" class="svc-staff-label">{{ svc.staffName }}</span>
              </template>
            </div>
          </div>

          <!-- Prix -->
          <div v-if="svc.price != null" class="svc-price">{{ svc.price }} DH</div>

          <!-- Action principale -->
          <div class="svc-action">
            <button
              v-if="canServe(svc)"
              class="btn-action btn-action--serve"
              @click="serveService(svc)"
              :disabled="isSaving"
            >Servir →</button>

            <button
              v-else-if="canChangeStaff(svc) && editingStaffSvcId !== svc.svcId"
              class="btn-action"
              :class="pendingFinishId === svc.svcId ? 'btn-action--confirm' : 'btn-action--finish'"
              @click="askFinish(svc)"
              :disabled="isSaving"
            >
              <svg v-if="pendingFinishId !== svc.svcId" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              {{ pendingFinishId === svc.svcId ? 'Confirmer ?' : 'Terminer' }}
            </button>

            <button
              v-if="svc.status === 'active'"
              class="btn-del"
              @click="deleteService(svc)"
              :disabled="isSaving"
              title="Supprimer"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>
      </div>

    </div>

    <!-- Total + footer -->
    <div class="recap-footer">

      <!-- Total -->
      <div v-if="totalPrice !== null" class="total-row">
        <span class="total-label">Total</span>
        <span class="total-amount">{{ totalPrice }} DH</span>
      </div>

      <!-- Paiement : lecture seule -->
      <div v-if="isPaid" class="payment-done">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        Payé · {{ METHOD_LABELS[paymentMethod] || paymentMethod }}
      </div>

      <!-- Bouton encaisser unique -->
      <button v-else-if="isPayable" class="btn-encaisser" @click="emit('encaisser', appointment)" :disabled="isSaving">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
        {{ totalPrice != null ? `Encaisser ${totalPrice} DH` : 'Encaisser' }}
      </button>

      <div class="footer-actions">
        <button v-if="isWalkin" class="btn-delete-icon" @click="confirmCancel = true" :disabled="isSaving" title="Supprimer le client">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
        <div v-else></div>
        <button v-if="!isPayable" class="btn btn-primary" @click="$emit('close')">Fermer</button>
      </div>
    </div>

    <!-- Confirmation suppression totale -->
    <BaseModal title="Supprimer le groupe" v-if="confirmCancel" @close="confirmCancel = false">
      <div class="modal-body">
        <p style="font-size:13.5px;color:var(--text-main);line-height:1.6">
          Supprimer définitivement toutes les prestations de <strong>{{ clientName }}</strong> ?
        </p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="confirmCancel = false">Retour</button>
        <button class="btn btn-danger" @click="deleteAll" :disabled="isSaving">Supprimer</button>
      </div>
    </BaseModal>

  </BaseModal>
</template>

<style scoped>
/* ── Sous-titre arrivée ── */
.recap-meta {
  display: flex; align-items: center; gap: 6px;
  padding: 0 0 14px;
  font-size: 12.5px; color: var(--text-muted);
}
.recap-arrival { font-weight: 600; }
.recap-status {
  font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 99px;
}
.recap-status--noshow {
  background: rgba(245,158,11,.12); color: var(--orange);
  border: 1px solid rgba(245,158,11,.25);
}
.recap-status--cancelled {
  background: rgba(220,38,38,.08); color: var(--red);
  border: 1px solid rgba(220,38,38,.2);
}
.recap-status--done {
  background: rgba(0,0,0,.06); color: var(--text-muted);
  border: 1px solid rgba(0,0,0,.1);
}
.recap-status--inprogress {
  background: rgba(74,222,128,.12); color: var(--green);
  border: 1px solid rgba(21,128,61,.2);
}
.recap-wait    { color: var(--orange); font-weight: 600; }
.recap-tag {
  margin-left: 4px; font-size: 10px; font-weight: 700;
  padding: 2px 8px; border-radius: 99px;
  background: var(--primary-soft); color: var(--primary);
  border: 1px solid var(--primary-mid);
}

/* ── Services list ── */
.svcs-list { display: flex; flex-direction: column; gap: 0; }

.svc-row {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 0;
  border-bottom: 1px solid var(--border);
}
.svc-row:last-child { border-bottom: none; }
.svc-row--done     { opacity: .55; }
.svc-row--cancelled { opacity: .4; }

/* ── Indicateur ── */
.svc-indicator {
  width: 20px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--green);
}
.dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.dot--green  { background: var(--green); box-shadow: 0 0 0 3px rgba(21,128,61,.15); }
.dot--orange { background: var(--orange); box-shadow: 0 0 0 3px rgba(217,119,6,.15); }

/* ── Corps ── */
.svc-body { flex: 1; min-width: 0; }
.svc-name {
  font-size: 13.5px; font-weight: 700; color: var(--text-main);
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 4px;
}
.badge-parallel {
  font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 99px;
  background: var(--blue-soft); color: var(--blue); border: 1px solid rgba(29,78,216,.2);
}
.svc-detail {
  display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
}
.svc-dur {
  font-size: 10.5px; font-weight: 600; color: var(--text-muted);
  background: var(--bg-soft); border: 1px solid var(--border);
  border-radius: 5px; padding: 2px 7px; flex-shrink: 0;
}
.staff-chip {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11.5px; font-weight: 600; color: var(--text-muted);
  background: transparent; border: 1px solid var(--border-strong);
  border-radius: 6px; padding: 2px 8px; cursor: pointer;
  font-family: inherit; transition: all .12s;
}
.staff-chip:hover:not(:disabled) { background: rgba(0,0,0,.04); color: var(--text-main); }
.svc-staff-label { font-size: 11.5px; color: var(--text-muted); }

/* ── Prix ── */
.svc-price {
  font-size: 13.5px; font-weight: 800; color: var(--primary);
  flex-shrink: 0; white-space: nowrap;
}

/* ── Action ── */
.svc-action { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

.btn-action {
  display: flex; align-items: center; gap: 5px;
  padding: 7px 16px; border-radius: 9px; border: none;
  font-size: 12.5px; font-weight: 700; cursor: pointer;
  font-family: inherit; white-space: nowrap; transition: all .15s;
}
.btn-action--serve  { background: var(--primary-soft); color: var(--primary); border: 1px solid var(--primary-mid); }
.btn-action--serve:hover:not(:disabled)  { background: var(--primary); color: #fff; }
.btn-action--finish { background: var(--green); color: #fff; box-shadow: 0 2px 8px rgba(21,128,61,.25); }
.btn-action--finish:hover:not(:disabled) { background: var(--green-dark, #15803d); }
.btn-action--confirm { background: var(--orange); color: #fff; animation: pulse-confirm .4s ease infinite alternate; }
@keyframes pulse-confirm { from { opacity: .85; } to { opacity: 1; } }

.btn-del {
  width: 30px; height: 30px; border-radius: 7px; background: transparent;
  border: 1px solid rgba(220,38,38,.2); color: var(--red);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all .12s; flex-shrink: 0;
}
.btn-del:hover:not(:disabled) { background: var(--red-soft); }

.btn-xs {
  padding: 4px 10px; border-radius: 6px; border: none;
  font-size: 11px; font-weight: 700; cursor: pointer; font-family: inherit;
}
.btn-xs--gold  { background: var(--primary); color: #fff; }
.btn-xs--ghost { background: transparent; border: 1px solid var(--border-strong); color: var(--text-muted); }

.btn-action:disabled, .btn-del:disabled { opacity: .4; cursor: not-allowed; }

/* ── Footer ── */
.recap-footer { padding-top: 4px; }

.total-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 11px 14px; margin-bottom: 12px;
  background: var(--bg-soft); border: 1px solid var(--border); border-radius: 11px;
}
.total-label  { font-size: 13px; font-weight: 600; color: var(--text-muted); }
.total-amount { font-size: 17px; font-weight: 800; color: var(--primary); }

.footer-actions {
  display: flex; align-items: center; justify-content: space-between;
}
.btn-delete-icon {
  width: 30px; height: 30px; border-radius: 7px;
  background: transparent; border: 1px solid transparent;
  color: var(--text-light); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.btn-delete-icon:hover:not(:disabled) { background: var(--red-soft); color: var(--red); border-color: rgba(220,38,38,.2); }
.btn-delete-icon:disabled { opacity: .3; cursor: not-allowed; }

.btn-danger {
  background: var(--red); color: #fff; border: none; padding: 9px 18px; border-radius: 11px;
  font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; transition: background .15s;
}
.btn-danger:hover:not(:disabled) { filter: brightness(1.1); }

/* ── Paiement ── */
.payment-done {
  display: flex; align-items: center; gap: 7px;
  padding: 9px 14px; margin-bottom: 10px;
  background: rgba(21,128,61,.08); border: 1px solid rgba(21,128,61,.2);
  border-radius: 11px; font-size: 13px; font-weight: 700; color: var(--green);
}

.btn-encaisser {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  width: 100%; padding: 11px; border-radius: 11px; border: none;
  background: var(--primary); color: #fff;
  font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit;
  transition: background .15s; margin-bottom: 10px;
}
.btn-encaisser:hover:not(:disabled) { background: #8A6A08; }
.btn-encaisser:disabled { opacity: .45; cursor: not-allowed; }
.btn-encaisser:disabled { opacity: .45; cursor: not-allowed; }
</style>
