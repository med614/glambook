<script setup>
import BaseModal from '../modal/BaseModal.vue'

defineProps({
  open: Boolean,
  title: {
    type: String,
    default: 'Confirmer la suppression'
  },
  message: {
    type: String,
    default: 'Êtes-vous sûr de vouloir effectuer cette action ? Cette opération est irréversible.'
  },
  confirmText: {
    type: String,
    default: 'Supprimer'
  },
  cancelText: {
    type: String,
    default: 'Annuler'
  },
  danger: {
    type: Boolean,
    default: true
  }
})

defineEmits(['close', 'confirm'])
</script>

<template>
  <BaseModal v-if="open" @close="$emit('close')">
    <header class="modal-title" :class="{ 'danger-title': danger }">
      <div class="title-with-icon">
        <svg v-if="danger" class="icon-trash" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
        {{ title }}
      </div>
    </header>

    <div class="modal-body">
      <p class="confirm-message">
        {{ message }}
      </p>
    </div>

    <div class="modal-actions">
      <button class="btn btn-cancel" @click="$emit('close')">
        {{ cancelText }}
      </button>
      
      <button 
        class="btn btn-confirm-action" 
        :class="{ 'btn-danger-solid': danger, 'btn-primary-solid': !danger }"
        @click="$emit('confirm')"
      >
        {{ confirmText }}
      </button>
    </div>
  </BaseModal>
</template>

<style scoped>
.title-with-icon {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-trash {
  color: #ef4444;
}

.danger-title {
  color: #ef4444 !important;
}

.confirm-message {
  font-size: 14.5px;
  color: #475569; /* Slate 600 */
  line-height: 1.6;
  margin-top: -8px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

/* CUSTOM BUTTON STYLES FOR THE MODAL */
.btn-cancel {
  background: #fff;
  border: 1px solid #e2e8f0;
  color: #1e293b;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.btn-cancel:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.btn-confirm-action {
  padding: 10px 24px;
  border: none;
  color: #fff;
  font-weight: 600;
}

.btn-danger-solid {
  background: #ef4444;
}

.btn-danger-solid:hover {
  background: #dc2626;
}

.btn-primary-solid {
  background: var(--accent-teal);
}

.btn-primary-solid:hover {
  background: #3d7e91;
}
</style>
