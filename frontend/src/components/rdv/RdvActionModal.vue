<script setup>
import { ref, computed } from 'vue'
import BaseModal from '@/components/modal/BaseModal.vue'
import AppIcon from '@/components/common/AppIcon.vue'

const emit = defineEmits(['close', 'cancelRdv', 'noshowRdv', 'deleteRdv'])

const step = ref('actions') // actions | confirm
const selectedAction = ref(null)

const actions = {
  cancel: {
    title: 'Annuler le rendez-vous',
    message: 'Êtes-vous sûr de vouloir annuler ce rendez-vous ? Il sera retiré de la liste des rendez-vous planifiés.',
    confirm: 'Confirmer l\'annulation',
    danger: true
  },
  noshow: {
    title: 'Marquer comme absent',
    message: 'Voulez-vous marquer ce client comme absent ? Le rendez-vous sera retiré du planning.',
    confirm: 'Confirmer l\'absence',
    danger: true
  },
  delete: {
    title: 'Supprimer définitivement',
    message: '⚠️ Cette action est irréversible. Êtes-vous sûr de vouloir supprimer définitivement ce rendez-vous ?',
    confirm: 'Supprimer',
    danger: true
  }
}

const current = computed(() =>
  selectedAction.value ? actions[selectedAction.value] : null
)

function openConfirm(type) {
  selectedAction.value = type
  step.value = 'confirm'
}

function back() {
  step.value = 'actions'
  selectedAction.value = null
}

function confirm() {
  if (selectedAction.value === 'cancel') emit('cancelRdv')
  if (selectedAction.value === 'noshow') emit('noshowRdv')
  if (selectedAction.value === 'delete') emit('deleteRdv')
}
</script>

<template>
  <BaseModal @close="emit('close')" class="lux-modal">
    <header class="lux-header" :class="{ 'danger-mode': step === 'confirm' }">
      <div class="lux-icon-box" :class="{ 'danger-icon': step === 'confirm' }">
        <AppIcon :name="step === 'actions' ? 'settings' : 'alert-triangle'" :size="22" />
      </div>
      <div class="lux-titles">
        <h2>{{ step === 'actions' ? 'Gérer ce rendez-vous' : current.title }}</h2>
        <p>{{ step === 'actions' ? 'Sélectionnez une action administrative à effectuer' : 'Veuillez confirmer votre décision ci-dessous' }}</p>
      </div>
      <button class="lux-close" @click="emit('close')">&times;</button>
    </header>

    <div class="lux-body">
      <!-- ÉTAPE 1 : ACTIONS -->
      <div v-if="step === 'actions'" class="action-list">
        <div class="action-card" @click="openConfirm('cancel')">
          <div class="action-icon gray">
            <AppIcon name="x-circle" :size="18" />
          </div>
          <div class="action-text">
            <strong>Le client a annulé</strong>
            <p>Retirer proprement du planning</p>
          </div>
          <AppIcon name="chevron-right" :size="14" class="action-arrow" />
        </div>

        <div class="action-card" @click="openConfirm('noshow')">
          <div class="action-icon orange">
            <AppIcon name="user-x" :size="18" />
          </div>
          <div class="action-text">
            <strong>Client absent (No-show)</strong>
            <p>Marquer l'absence au rendez-vous</p>
          </div>
          <AppIcon name="chevron-right" :size="14" class="action-arrow" />
        </div>

        <div class="action-card danger" @click="openConfirm('delete')">
          <div class="action-icon red">
            <AppIcon name="trash" :size="18" />
          </div>
          <div class="action-text">
            <strong>Supprimer le RDV</strong>
            <p>Action irréversible et radicale</p>
          </div>
          <AppIcon name="chevron-right" :size="14" class="action-arrow" />
        </div>
      </div>

      <!-- ÉTAPE 2 : CONFIRMATION -->
      <div v-else class="confirm-content">
        <div class="warning-banner">
          <AppIcon name="alert-triangle" :size="16" />
          <span>Attention, cette action ne peut pas être annulée</span>
        </div>
        <p class="confirm-message">{{ current.message }}</p>
      </div>
    </div>

    <footer class="lux-footer" :class="{ 'space-between': step === 'confirm' }">
      <button class="lux-btn secondary" @click="step === 'actions' ? emit('close') : back()">
        {{ step === 'actions' ? 'Fermer' : 'Retour' }}
      </button>
      
      <button
        v-if="step === 'confirm'"
        class="lux-btn"
        :class="current.danger ? 'danger-solid' : 'primary'"
        @click="confirm"
      >
        {{ current.confirm }}
      </button>
    </footer>
  </BaseModal>
</template>

<style scoped>
@import '@/assets/lux-modal.css';

.danger-mode .lux-titles h2 {
  color: #ef4444;
}

.lux-icon-box.danger-icon {
  background: linear-gradient(135deg, #fca5a5 0%, #ef4444 100%);
}

.action-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.action-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.action-card:hover {
  border-color: #3182ce;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}

.action-card.danger:hover {
  border-color: #fecaca;
  background: #fffcfc;
}

.action-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.action-icon.gray { background: #f1f5f9; color: #64748b; }
.action-icon.orange { background: #fff7ed; color: #f59e0b; }
.action-icon.red { background: #fef2f2; color: #ef4444; }

.action-text {
  flex: 1;
  min-width: 0;
}

.action-text strong {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  word-wrap: break-word;
}

.action-text p {
  font-size: 12px;
  color: #64748b;
  margin: 2px 0 0;
  word-wrap: break-word;
}

.action-arrow {
  color: #cbd5e1;
  transition: transform 0.2s;
  flex-shrink: 0;
}

.action-card:hover .action-arrow {
  color: #3182ce;
  transform: translateX(3px);
}

.warning-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: #fffbeb;
  border: 1.5px solid #fde68a;
  border-radius: 10px;
  color: #92400e;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 16px;
}

.confirm-message {
  font-size: 14px;
  color: #475569;
  line-height: 1.6;
  margin: 0;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.lux-footer.space-between {
  justify-content: space-between;
}

.lux-btn.danger-solid {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
}

.lux-btn.danger-solid:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
}
</style>