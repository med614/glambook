<script setup>
import { ref, computed } from 'vue'
import BaseModal from '@/components/modal/BaseModal.vue'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps({ rdv: { type: Object, default: null } })
const emit = defineEmits(['close', 'editRdv', 'cancelRdv', 'noshowRdv', 'deleteRdv'])


// ── Résumé ─────────────────────────────────────────────────────────────────
function one(val) { return Array.isArray(val) ? val[0] : val }

function clientName() {
  const cl = one(props.rdv?.client)
  if (!cl) return '—'
  return [cl.name, cl.last_name].filter(x => x?.trim()).join(' ') || '—'
}
function clientInitial() {
  const name = clientName()
  return name && name !== '—' ? name.trim().charAt(0).toUpperCase() : 'R'
}
function clientMeta() {
  const cl = one(props.rdv?.client)
  const bits = []
  if (cl?.phone) bits.push(cl.phone)
  if (props.rdv?.type === 'walkin') bits.push('Sans RDV')
  return bits.join(' · ') || 'Client salon'
}
const isoToLocalHHMM = iso => {
  if (!iso) return ''
  const d = new Date(iso)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}
function apptTime() { return isoToLocalHHMM(props.rdv?.start_time) || '—' }
function apptEndTime() {
  const start = props.rdv?.start_time
  if (!start) return ''
  const duration = (props.rdv?.appointment_services || [])
    .filter(s => s.status !== 'cancelled')
    .reduce((sum, s) => sum + (one(s.service)?.duration_minutes || 0), 0)
  if (!duration) return ''
  const end = new Date(new Date(start).getTime() + duration * 60000)
  return isoToLocalHHMM(end.toISOString())
}
function timeRange() {
  const end = apptEndTime()
  return end ? `${apptTime()} – ${end}` : apptTime()
}
function apptDate() {
  if (!props.rdv?.start_time) return '—'
  return new Date(props.rdv.start_time).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}
function services() {
  const list = props.rdv?.appointment_services || []
  return list.map(s => one(s.service)?.name).filter(Boolean).join(', ') || '—'
}
function totalPrice() {
  const list = (props.rdv?.appointment_services || []).filter(s => s.status !== 'cancelled')
  const prices = list.map(s => s.price_at_booking ?? one(s.service)?.price ?? null)
  if (prices.every(p => p === null)) return null
  return prices.reduce((sum, p) => sum + (p ?? 0), 0)
}
function staffNames() {
  const list = props.rdv?.appointment_services || []
  const names = [...new Set(list.map(s => one(s.staff)?.name).filter(Boolean))]
  return names.join(', ') || null
}
function sourceLabel() {
  const src = props.rdv?.source
  if (src === 'whatsapp') return 'WhatsApp'
  if (src === 'phone') return 'Téléphone'
  if (src === 'online') return 'En ligne'
  return props.rdv?.type === 'walkin' ? 'Accueil salon · Sans RDV' : 'Accueil salon'
}
const STATUS_LABELS = { scheduled: 'Planifié', in_progress: 'En cours', completed: 'Terminé', cancelled: 'Annulé', noshow: 'Absent' }
const STATUS_COLORS = { scheduled: 'var(--primary)', in_progress: 'var(--green)', completed: 'var(--text-muted)', cancelled: 'var(--red)', noshow: 'var(--red)' }
function statusLabel() { return STATUS_LABELS[props.rdv?.status] || props.rdv?.status || '—' }
function statusColor() { return STATUS_COLORS[props.rdv?.status] || 'var(--text-light)' }

// ── Logique actions selon statut ────────────────────────────────────────────
const CLOSED = ['cancelled', 'noshow', 'completed']
const isClosed = computed(() => CLOSED.includes(props.rdv?.status))

// ── Confirmation ────────────────────────────────────────────────────────────
const confirmAction = ref(null) // null | 'cancel' | 'noshow' | 'delete'

const confirmTexts = {
  cancel: { title: 'Annuler le rendez-vous', message: 'Êtes-vous sûr de vouloir annuler ce rendez-vous ?', btn: 'Confirmer l\'annulation' },
  noshow: { title: 'Marquer comme absent',   message: 'Marquer ce client comme absent (no-show) ?',        btn: 'Confirmer l\'absence' },
  delete: { title: 'Supprimer définitivement', message: '⚠️ Action irréversible. Supprimer ce rendez-vous ?', btn: 'Supprimer' }
}

function askConfirm(type) { if (!isClosed.value || type === 'delete') confirmAction.value = type }
function cancelConfirm() { confirmAction.value = null }
function runConfirm() {
  if (confirmAction.value === 'cancel') emit('cancelRdv')
  if (confirmAction.value === 'noshow') emit('noshowRdv')
  if (confirmAction.value === 'delete') emit('deleteRdv')
}
</script>

<template>
  <BaseModal @close="emit('close')">
    <!-- Header personnalisé -->
    <div class="modal-header">
      <div class="modal-header-dot"></div>
      <span class="modal-title">Détail du rendez-vous</span>
      <button class="modal-close" @click="emit('close')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div class="rdv-detail-hero">
      <div class="rdv-detail-av">{{ clientInitial() }}</div>
      <div class="rdv-detail-client">
        <div class="rdv-detail-name">{{ clientName() }}</div>
        <div class="rdv-detail-meta">{{ clientMeta() }}</div>
      </div>
      <span class="rdv-sum-badge" :style="{background: statusColor()+'18', color: statusColor(), border:`1px solid ${statusColor()}40`}">{{ statusLabel() }}</span>
    </div>

    <div class="modal-body">
      <!-- Résumé -->
      <div class="rdv-info-grid">
        <div class="rdv-info-row">
          <span class="rdv-info-label">Date</span>
          <span class="rdv-info-val">{{ apptDate() }}</span>
        </div>
        <div class="rdv-info-row">
          <span class="rdv-info-label">Horaire</span>
          <span class="rdv-info-val">{{ timeRange() }}</span>
        </div>
        <div class="rdv-info-row">
          <span class="rdv-info-label">Prestations</span>
          <span class="rdv-sum-value">{{ services() }}</span>
        </div>
        <div v-if="staffNames()" class="rdv-info-row">
          <span class="rdv-info-label">Collaborateur</span>
          <span class="rdv-info-val">{{ staffNames() }}</span>
        </div>
        <div class="rdv-info-row">
          <span class="rdv-info-label">Origine</span>
          <span class="rdv-info-val">{{ sourceLabel() }}</span>
        </div>
      </div>

      <!-- Confirmation inline -->
      <div v-if="confirmAction" class="confirm-content">
        <div class="warning-banner">
          <AppIcon name="alert-triangle" :size="16" />
          <span>{{ confirmTexts[confirmAction].title }}</span>
        </div>
        <p class="confirm-message">{{ confirmTexts[confirmAction].message }}</p>
      </div>
    </div>

    <div v-if="totalPrice() !== null" class="rdv-amount-row">
      <span class="rdv-amount-label">Montant total</span>
      <span class="rdv-amount-val">{{ totalPrice() }} DH</span>
    </div>

    <div class="modal-actions" :class="{ 'modal-actions--confirm': confirmAction }">
      <template v-if="confirmAction">
        <button class="btn btn-outline" @click="cancelConfirm()">Retour</button>
        <button class="btn btn-danger-solid" @click="runConfirm">{{ confirmTexts[confirmAction].btn }}</button>
      </template>
      <div v-else class="rdv-footer-actions">
        <button v-if="!isClosed" class="btn-modal-edit" @click="emit('editRdv')">Modifier</button>
        <button v-if="!isClosed" class="btn-modal-cancel" @click="askConfirm('cancel')">Annuler</button>
        <button v-if="!isClosed" class="btn-modal-noshow" @click="askConfirm('noshow')">Absence</button>
        <button class="btn-modal-delete" @click="askConfirm('delete')">Supprimer</button>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
/* ── Header spécifique (icône + sous-titre) ── */
:deep(.modal) {
  width: 440px;
}

.modal-header {
  justify-content: flex-start;
}

.rdv-detail-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.rdv-detail-av {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--primary-surface);
  border: 1.5px solid var(--border-strong);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  font-weight: 800;
  flex-shrink: 0;
}

.rdv-detail-client {
  flex: 1;
  min-width: 0;
}

.rdv-detail-name {
  font-size: 15px;
  font-weight: 800;
  color: var(--text-main);
}

.rdv-detail-meta {
  font-size: 11.5px;
  color: var(--text-muted);
  margin-top: 2px;
}

.rdv-sum-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
  white-space: nowrap;
}

.modal-body {
  padding: 0 24px;
  gap: 0;
}

.rdv-info-grid {
  display: flex;
  flex-direction: column;
}

.rdv-info-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 0;
  border-bottom: 1px solid var(--border);
}

.rdv-info-row:last-child {
  border-bottom: 0;
}

.rdv-info-label {
  color: var(--text-muted);
  flex-shrink: 0;
  font-size: 11.5px;
  font-weight: 600;
}

.rdv-info-val,
.rdv-sum-value {
  color: var(--text-main);
  font-size: 12.5px;
  font-weight: 600;
  text-align: right;
}

.rdv-sum-value {
  max-width: 250px;
}

.rdv-amount-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 24px;
  border-top: 1px solid var(--border);
  background: var(--bg-soft);
}

.rdv-amount-label {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.rdv-amount-val {
  color: var(--primary);
  font-size: 17px;
  font-weight: 800;
}

.rdv-footer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
}

.modal-actions--confirm {
  justify-content: space-between;
}

.warning-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px;
  background: var(--orange-soft); border: 1px solid var(--orange);
  border-radius: 10px; color: var(--orange);
  font-size: 13px; font-weight: 600; margin-bottom: 16px;
}

.confirm-message { font-size: 14px; color: var(--text-muted); line-height: 1.6; margin: 0; word-wrap: break-word; overflow-wrap: break-word; }

.btn-modal-edit,
.btn-modal-cancel,
.btn-modal-noshow,
.btn-modal-delete {
  padding: 9px 14px;
  border-radius: 11px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s, border-color .15s, color .15s, transform .1s;
}

.btn-modal-edit {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text-main);
}
.btn-modal-edit:hover { background: var(--bg-soft); }

.btn-modal-cancel {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
}
.btn-modal-cancel:hover { background: rgba(0,0,0,.04); color: var(--text-main); }

.btn-modal-noshow {
  background: var(--red-soft);
  border: 1px solid rgba(220,38,38,.2);
  color: var(--red);
}
.btn-modal-noshow:hover { background: rgba(220,38,38,.18); }

.btn-modal-delete {
  background: var(--red);
  border: 1px solid transparent;
  color: #fff;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(220,38,38,.25);
}
.btn-modal-delete:hover {
  background: var(--red);
  filter: brightness(.9);
  transform: translateY(-1px);
}

.btn-danger-solid {
  background: var(--red); color: #fff; border-color: transparent;
  box-shadow: 0 2px 8px rgba(220,38,38,.3);
}
.btn-danger-solid:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(220,38,38,.4);
}

@media (max-width: 520px) {
  .rdv-detail-hero {
    align-items: flex-start;
  }

  .rdv-info-row {
    gap: 10px;
  }

  .modal-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .rdv-footer-actions,
  .modal-actions > .btn {
    width: 100%;
  }

  .rdv-footer-actions > button,
  .modal-actions > .btn {
    flex: 1;
  }
}
</style>
