<script setup>
import { ref, watch } from 'vue'
import { createOrganization, updateOrganization } from '@/services/organizations.service'

const props = defineProps({
  organization: { type: Object, default: null }
})
const emit = defineEmits(['close', 'saved'])

const isEdit = ref(false)
const loading = ref(false)
const error = ref('')

const form = ref({
  name: '',
  type: 'salon',
  phone: '',
  whatsapp_automation_number: '',
  is_active: true,
  email: '',
  admin_name: ''
})

watch(() => props.organization, (org) => {
  if (org) {
    isEdit.value = true
    form.value = {
      name: org.name || '',
      type: org.type || 'salon',
      phone: org.phone || '',
      whatsapp_automation_number: org.whatsapp_automation_number || '',
      is_active: org.is_active ?? true,
      email: org.email || '',
      admin_name: org.admin_name || ''
    }
  } else {
    isEdit.value = false
    form.value = { name: '', type: 'salon', phone: '', whatsapp_automation_number: '', is_active: true, email: '', admin_name: '' }
  }
  error.value = ''
}, { immediate: true })

async function save() {
  if (!form.value.name.trim()) { error.value = 'Le nom est obligatoire.'; return }
  if (!isEdit.value && !form.value.email.trim()) { error.value = 'L\'email est obligatoire pour créer un compte.'; return }
  loading.value = true
  error.value = ''
  try {
    if (isEdit.value) {
      await updateOrganization(props.organization.id, {
        name: form.value.name,
        type: form.value.type,
        phone: form.value.phone,
        whatsapp_automation_number: form.value.whatsapp_automation_number,
        is_active: form.value.is_active,
        admin_name: form.value.admin_name
      })
    } else {
      await createOrganization(form.value)
    }
    emit('saved')
  } catch (e) {
    error.value = e.message || 'Une erreur est survenue.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @mousedown.self="$emit('close')">
      <div class="modal">

        <!-- Header -->
        <div class="modal-head">
          <div class="modal-head-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
          </div>
          <div>
            <h2 class="modal-title">{{ isEdit ? 'Modifier l\'organisation' : 'Nouvelle organisation' }}</h2>
            <p class="modal-sub">{{ isEdit ? 'Mettez à jour les informations' : 'Ajouter un nouvel établissement' }}</p>
          </div>
          <button class="modal-close" @click="$emit('close')">&times;</button>
        </div>

        <!-- Body -->
        <div class="modal-body">
          <div v-if="error" class="modal-error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {{ error }}
          </div>

          <!-- Section établissement -->
          <p class="section-label">Établissement</p>

          <div class="field">
            <label>Nom de l'organisation *</label>
            <input v-model="form.name" type="text" placeholder="Ex: Salon Layla, Cabinet Dr. Benali…" />
          </div>

          <div class="field-row">
            <div class="field">
              <label>Type</label>
              <select v-model="form.type">
                <option value="salon">Salon de coiffure</option>
                <option value="cabinet">Cabinet médical</option>
                <option value="spa">Spa / Bien-être</option>
                <option value="other">Autre</option>
              </select>
            </div>
            <div class="field">
              <label>Statut</label>
              <div class="toggle-field">
                <span>{{ form.is_active ? 'Active' : 'Suspendue' }}</span>
                <label class="toggle">
                  <input type="checkbox" v-model="form.is_active" />
                  <span class="slider"></span>
                </label>
              </div>
            </div>
          </div>

          <div class="field-row">
            <div class="field">
              <label>Téléphone</label>
              <input v-model="form.phone" type="tel" placeholder="+212 6XX XXX XXX" />
            </div>
            <div class="field">
              <label>Numéro WhatsApp</label>
              <input v-model="form.whatsapp_automation_number" type="tel" placeholder="+212 6XX XXX XXX" />
            </div>
          </div>

          <!-- Section compte -->
          <p class="section-label" style="margin-top:4px;">Compte administrateur</p>

          <div class="field-row">
            <div class="field">
              <label>Nom du responsable</label>
              <input v-model="form.admin_name" type="text" placeholder="Ex: Fatima Zahra" />
            </div>
            <div class="field">
              <label>Email de connexion {{ !isEdit ? '*' : '' }}</label>
              <input
                v-model="form.email"
                type="email"
                placeholder="admin@salon.ma"
                :disabled="isEdit"
                :title="isEdit ? 'Modifiez l\'email depuis la fiche de l\'organisation' : ''"
              />
            </div>
          </div>

          <div v-if="!isEdit" class="info-banner">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Un email d'invitation sera envoyé à l'adresse renseignée pour définir le mot de passe.
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-foot">
          <button class="btn-cancel" @click="$emit('close')" :disabled="loading">Annuler</button>
          <button class="btn-save" @click="save" :disabled="loading || !form.name.trim()">
            {{ loading ? 'Enregistrement…' : (isEdit ? 'Enregistrer' : 'Créer & inviter') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.modal {
  background: #fff;
  border-radius: 16px;
  width: 100%;
  max-width: 560px;
  box-shadow: 0 24px 60px rgba(0,0,0,0.2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 24px 24px 20px;
  border-bottom: 1px solid #f1f5f9;
  position: relative;
}
.modal-head-icon {
  width: 42px; height: 42px;
  background: linear-gradient(135deg, #e0e7ff, #dbeafe);
  color: #3b82f6;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.modal-title { font-size: 17px; font-weight: 800; color: #0f172a; margin: 0; }
.modal-sub   { font-size: 12.5px; color: #64748b; margin: 3px 0 0; }
.modal-close {
  position: absolute; top: 20px; right: 20px;
  width: 30px; height: 30px;
  border: none; background: #f1f5f9;
  border-radius: 50%; font-size: 20px;
  color: #64748b; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.modal-close:hover { background: #e2e8f0; color: #0f172a; }

.modal-body {
  padding: 22px 24px;
  display: flex; flex-direction: column; gap: 14px;
  max-height: 70vh;
  overflow-y: auto;
}

.section-label {
  font-size: 11px; font-weight: 800; text-transform: uppercase;
  letter-spacing: .08em; color: #94a3b8; margin: 0;
}

.modal-error {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  background: #fef2f2; border: 1px solid #fca5a5;
  border-radius: 8px; font-size: 13px; color: #dc2626; font-weight: 600;
}

.info-banner {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 14px;
  background: #eff6ff; border: 1px solid #bfdbfe;
  border-radius: 8px; font-size: 12.5px; color: #1d4ed8; font-weight: 500;
  line-height: 1.5;
}

.field { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.field label { font-size: 12.5px; font-weight: 700; color: #475569; }
.field input, .field select {
  padding: 9px 12px;
  border: 1.5px solid #e2e8f0;
  border-radius: 9px;
  font-size: 13.5px;
  color: #0f172a;
  background: #f8fafc;
  transition: border-color .15s;
}
.field input:focus, .field select:focus {
  outline: none;
  border-color: #6366f1;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(99,102,241,.1);
}
.field input:disabled {
  background: #f1f5f9; color: #94a3b8; cursor: not-allowed;
}

.field-row { display: flex; gap: 14px; }

.toggle-field {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 12px;
  border: 1.5px solid #e2e8f0;
  border-radius: 9px;
  background: #f8fafc;
  font-size: 13.5px; color: #0f172a; font-weight: 600;
}
.toggle { position: relative; display: inline-block; width: 40px; height: 22px; flex-shrink: 0; }
.toggle input { display: none; }
.slider {
  position: absolute; inset: 0;
  background: #cbd5e1; border-radius: 22px; cursor: pointer;
  transition: .25s;
}
.slider:before {
  content: ''; position: absolute;
  width: 16px; height: 16px; left: 3px; bottom: 3px;
  background: #fff; border-radius: 50%;
  transition: .25s;
  box-shadow: 0 1px 3px rgba(0,0,0,.2);
}
.toggle input:checked + .slider { background: #6366f1; }
.toggle input:checked + .slider:before { transform: translateX(18px); }

.modal-foot {
  display: flex; align-items: center; justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid #f1f5f9;
  background: #f8fafc;
}

.btn-cancel {
  padding: 9px 18px;
  border: 1.5px solid #e2e8f0; border-radius: 9px;
  background: #fff; color: #64748b;
  font-size: 13.5px; font-weight: 600; cursor: pointer;
  transition: all .15s;
}
.btn-cancel:hover { background: #f1f5f9; color: #1e293b; }

.btn-save {
  padding: 9px 22px;
  border: none; border-radius: 9px;
  background: linear-gradient(135deg, #6366f1, #3b82f6);
  color: #fff; font-size: 13.5px; font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(99,102,241,.3);
  transition: opacity .15s;
}
.btn-save:hover:not(:disabled) { opacity: .9; }
.btn-save:disabled, .btn-cancel:disabled { opacity: .5; cursor: not-allowed; }
</style>
