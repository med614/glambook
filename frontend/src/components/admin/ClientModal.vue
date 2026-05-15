<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-container premium-modal">
      <header class="modal-header">
        <div class="header-content">
          <AppIcon :name="client ? 'edit' : 'plus'" :size="24" strokeWidth="2.5" />
          <div>
            <h2>{{ client ? 'Modifier le Client' : 'Ajouter un Client' }}</h2>
            <p>{{ client ? 'Mettez à jour les informations du profil.' : 'Enregistrez un nouveau client dans votre base.' }}</p>
          </div>
        </div>
        <button class="btn-close" @click="$emit('close')">&times;</button>
      </header>

      <form @submit.prevent="handleSubmit" class="modal-form">
        <div class="field-row">
          <div class="form-group flex-1">
            <label>Prénom</label>
            <input 
              v-model="form.name" 
              type="text" 
              placeholder="Ex: Nabil" 
              required 
            />
          </div>
          <div class="form-group flex-1">
            <label>Nom</label>
            <input 
              v-model="form.last_name" 
              type="text" 
              placeholder="Ex: BERRADA" 
            />
          </div>
        </div>

        <div class="form-group">
          <label>Téléphone</label>
          <div class="input-with-icon">
             <input
               :value="form.phone"
               @input="onPhoneInput"
               type="tel"
               placeholder="06 12 34 56 78"
               required
               :class="{ 'input-error': form.phone && !isValidPhone(form.phone) }"
             />
             <span v-if="form.phone && !isValidPhone(form.phone)" style="font-size:11.5px;color:#dc2626;margin-top:4px;display:block;">
               Format invalide — ex: 06 12 34 56 78 ou 07 XX XX XX XX
             </span>
          </div>
        </div>

        <div v-if="duplicateClient" class="duplicate-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div style="flex:1;">
            <strong>Doublon détecté</strong><br/>
            Un client existe déjà avec ce numéro :
            <strong>{{ duplicateClient.name }} {{ duplicateClient.last_name || '' }}</strong>.
          </div>
          <button type="button" class="btn-secondary" style="font-size:12px;padding:6px 12px;" @click="ignoreDuplicate">Ignorer</button>
        </div>

        <div v-if="error" class="error-banner">
          {{ error }}
        </div>

        <div class="modal-footer">
          <button type="button" class="btn-secondary" @click="$emit('close')">Annuler</button>
          <button type="submit" class="btn-primary" :disabled="loading">
            <span v-if="loading">Enregistrement...</span>
            <span v-else>{{ client ? 'Enregistrer les modifications' : 'Créer le client' }}</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import AppIcon from '../common/AppIcon.vue'
import { updateClient, getOrCreateClient, findClientByPhone } from '../../services/clients.service'
import { formatPhone, isValidPhone } from '@/utils/phone'

const props = defineProps({
  client: { type: Object, default: null }
})

const emit = defineEmits(['close', 'saved'])

const form = ref({
  name: '',
  last_name: '',
  phone: ''
})

const loading = ref(false)
const error = ref('')
const duplicateClient = ref(null)  // client existant avec même téléphone

function onPhoneInput(e) {
  form.value.phone = formatPhone(e.target.value)
}

onMounted(() => {
  if (props.client) {
    form.value = {
      name: props.client.name || '',
      last_name: props.client.last_name || '',
      phone: props.client.phone || ''
    }
  }
})

async function handleSubmit() {
  if (!isValidPhone(form.value.phone)) {
    error.value = 'Numéro de téléphone invalide. Format attendu : 06 12 34 56 78 (Maroc)'
    return
  }
  loading.value = true
  error.value = ''
  duplicateClient.value = null
  try {
    if (props.client) {
      // En mode édition : vérifier doublon uniquement si le téléphone a changé
      const phoneChanged = form.value.phone.replace(/\s/g, '') !== (props.client.phone || '').replace(/\s/g, '')
      if (phoneChanged) {
        const existing = await findClientByPhone(form.value.phone)
        if (existing && existing.id !== props.client.id) {
          duplicateClient.value = existing
          loading.value = false
          return
        }
      }
      await updateClient(props.client.id, form.value)
    } else {
      // En mode création : vérifier doublon
      const existing = await findClientByPhone(form.value.phone)
      if (existing) {
        duplicateClient.value = existing
        loading.value = false
        return
      }
      await getOrCreateClient(form.value)
    }
    emit('saved')
  } catch (err) {
    error.value = "Erreur lors de l'enregistrement. Vérifiez le format du téléphone."
  } finally {
    loading.value = false
  }
}

function ignoreDuplicate() {
  duplicateClient.value = null
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
}

.premium-modal {
  background: #fff;
  width: 100%;
  max-width: 500px;
  border-radius: 24px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  animation: slidePop 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slidePop {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-header {
  padding: 32px;
  border-bottom: 1px solid var(--border-soft);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header-content {
  display: flex;
  gap: 16px;
  align-items: center;
  color: var(--accent-teal);
}

.header-content h2 {
  font-size: 20px;
  font-weight: 800;
  color: #1e293b;
  margin: 0;
}

.header-content p {
  font-size: 13px;
  color: #64748b;
  margin: 4px 0 0;
}

.btn-close {
  background: #f1f5f9;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #64748b;
  font-size: 20px;
}

.modal-form {
  padding: 32px;
}

.field-row {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 24px;
}

.form-group label {
  display: block;
  font-size: 11px;
  font-weight: 800;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 10px;
  padding-left: 2px;
}

.form-group input {
  width: 100%;
  padding: 12px 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  font-size: 14px;
  color: #1e293b;
  transition: all 0.2s ease;
}

.form-group input:focus {
  outline: none;
  background: #fff;
  border-color: #D9A758;
  box-shadow: 0 0 0 4px rgba(217, 167, 88, 0.1);
}
.form-group input.input-error { border-color: #dc2626; }

.flex-1 { flex: 1; }

.error-banner {
  background: #fef2f2;
  color: #ef4444;
  padding: 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 24px;
  border: 1px solid #fee2e2;
}
.duplicate-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #fffbeb;
  color: #92400e;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 13px;
  margin-bottom: 16px;
  border: 1px solid #fcd34d;
}

.modal-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
}

.btn-primary {
  background: #1e293b;
  color: #fff;
  border: none;
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: #0f172a;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.btn-secondary {
  background: #f1f5f9;
  color: #64748b;
  border: none;
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
</style>
