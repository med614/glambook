<template>
  <BaseModal @close="$emit('close')">
    <div class="modal-header">
      <div class="cl-hd-icon">
        <AppIcon :name="client ? 'edit' : 'plus'" :size="18" strokeWidth="2.5" />
      </div>
      <div class="cl-hd-content">
        <span class="modal-title">{{ client ? 'Modifier le Client' : 'Ajouter un Client' }}</span>
        <p class="cl-hd-sub">{{ client ? 'Mettez à jour les informations du profil.' : 'Enregistrez un nouveau client dans votre base.' }}</p>
      </div>
      <button class="modal-close" @click="$emit('close')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <form @submit.prevent="handleSubmit">
      <div class="modal-body">
        <div class="field-row">
          <div class="form-group flex-1">
            <label>Prénom</label>
            <input v-model="form.name" type="text" placeholder="Ex: Nabil" required />
          </div>
          <div class="form-group flex-1">
            <label>Nom</label>
            <input v-model="form.last_name" type="text" placeholder="Ex: BERRADA" />
          </div>
        </div>

        <div class="form-group">
          <label>Téléphone</label>
          <input
            :value="form.phone"
            @input="onPhoneInput"
            type="tel"
            placeholder="06 12 34 56 78"
            required
            :class="{ 'input-error': form.phone && !isValidPhone(form.phone) }"
          />
          <span v-if="form.phone && !isValidPhone(form.phone)" class="form-error">
            Format invalide — ex: 06 12 34 56 78 ou 07 XX XX XX XX
          </span>
        </div>

        <div v-if="duplicateClient" class="duplicate-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div style="flex:1;">
            <strong>Doublon détecté</strong><br/>
            Un client existe déjà avec ce numéro :
            <strong>{{ duplicateClient.name }} {{ duplicateClient.last_name || '' }}</strong>.
          </div>
          <button type="button" class="btn btn-outline btn-sm" @click="ignoreDuplicate">Ignorer</button>
        </div>

        <div v-if="error" class="error-banner">{{ error }}</div>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn btn-outline" @click="$emit('close')">Annuler</button>
        <button type="submit" class="btn btn-primary" :disabled="loading">
          {{ loading ? 'Enregistrement...' : (client ? 'Enregistrer les modifications' : 'Créer le client') }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import BaseModal from '../modal/BaseModal.vue'
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
/* Header icône + sous-titre */
.cl-hd-icon {
  width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0;
  background: var(--primary-soft); color: var(--primary);
  display: flex; align-items: center; justify-content: center;
}
.cl-hd-content { flex: 1; min-width: 0; }
.cl-hd-sub { font-size: 12px; color: var(--text-muted); margin: 2px 0 0; }

/* Disposition du formulaire */
.field-row { display: flex; gap: 14px; }
.flex-1 { flex: 1; min-width: 0; }

/* Override espacement form-group (modal.css met margin-bottom:0) */
.form-group { margin-bottom: 18px; }

/* Bandeaux */
.error-banner {
  background: var(--red-soft); color: var(--red);
  padding: 11px 14px; border-radius: 10px;
  font-size: 13px; font-weight: 600; border: 1px solid var(--red);
}
.duplicate-banner {
  display: flex; align-items: flex-start; gap: 10px;
  background: var(--orange-soft); color: var(--orange);
  padding: 12px 14px; border-radius: 10px;
  font-size: 13px; border: 1px solid var(--orange);
}
</style>
