<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { fetchSubscription, fetchPayments } from '@/services/subscriptions.service'
import { fetchSaasSettings } from '@/services/saasConfig.service'
import { fetchManagers, inviteManager, deleteManager } from '@/services/managers.service'
import { authService } from '@/services/auth.service'

const user = ref({ name: '', email: '', role: '' })

// -- Subscription --
const subscription   = ref(null)
const payments       = ref([])
const saasSettings   = ref({ whatsapp_number: '', contact_email: '' })

function statusLabel(s) {
  return { trial: 'Essai', active: 'Actif', suspended: 'Suspendu', cancelled: 'Annulé' }[s] || s
}
function statusClass(s) {
  return { trial: 'sub-badge--trial', active: 'sub-badge--active', suspended: 'sub-badge--suspended', cancelled: 'sub-badge--cancelled' }[s] || ''
}
function formatDateFr(d) {
  if (!d) return 'Non défini'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
function formatDateShort(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function openWhatsApp() {
  const num = saasSettings.value.whatsapp_number.replace(/\s+/g, '').replace(/^\+/, '')
  window.open(`https://wa.me/${num}`, '_blank')
}
function openEmail() {
  window.location.href = `mailto:${saasSettings.value.contact_email}`
}

const orgId      = ref(null)
const orgName    = ref('')
const orgLogo    = ref(null)
const orgLoading = ref(false)
const orgMsg     = ref({ type: '', text: '' })
const logoFile   = ref(null)
const logoPreview = ref(null)

onMounted(async () => {
  const { data } = await supabase.auth.getUser()
  if (data?.user) {
    const meta = data.user.user_metadata || {}
    const { data: org } = await supabase
      .from('organizations')
      .select('id, admin_name, name, logo_url')
      .eq('supabase_user_id', data.user.id)
      .single()

    user.value = {
      id:    data.user.id,
      email: data.user.email,
      name:  org?.admin_name || meta.admin_name || meta.name || data.user.email,
      role:  meta.role || 'admin'
    }
    newEmail.value = data.user.email
    if (org) {
      orgId.value   = org.id
      orgName.value = org.name || ''
      orgLogo.value = org.logo_url || null

      // Load subscription & payments
      const [sub, pays, settings] = await Promise.all([
        fetchSubscription(org.id),
        fetchPayments(org.id),
        fetchSaasSettings()
      ])
      subscription.value = sub
      payments.value     = pays.slice(0, 6)
      saasSettings.value = settings
    }
  }
})

function onLogoChange(e) {
  const file = e.target.files[0]
  if (!file) return
  logoFile.value = file
  logoPreview.value = URL.createObjectURL(file)
}

function removeLogo() {
  logoFile.value    = null
  logoPreview.value = null
  orgLogo.value     = null
}

async function saveOrg() {
  if (!orgId.value) return
  orgLoading.value = true
  orgMsg.value = { type: '', text: '' }
  try {
    let logoUrl = orgLogo.value

    // Upload logo if a new file is selected
    if (logoFile.value) {
      const ext  = logoFile.value.name.split('.').pop()
      const path = `${orgId.value}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('org-logos')
        .upload(path, logoFile.value, { upsert: true })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('org-logos').getPublicUrl(path)
      logoUrl = urlData.publicUrl
    }

    await supabase.from('organizations').update({
      name:     orgName.value.trim(),
      logo_url: logoUrl
    }).eq('id', orgId.value)

    orgLogo.value  = logoUrl
    logoFile.value = null
    orgMsg.value   = { type: 'success', text: 'Informations du salon mises à jour.' }
    // Notify sidebar to refresh
    window.dispatchEvent(new Event('org-updated'))
  } catch (e) {
    orgMsg.value = { type: 'danger', text: e.message }
  } finally {
    orgLoading.value = false
  }
}

// -- Email section --
const newEmail = ref('')
const emailLoading = ref(false)
const emailMsg = ref({ type: '', text: '' })

async function updateEmail() {
  if (!newEmail.value.trim() || newEmail.value === user.value.email) return
  emailLoading.value = true
  emailMsg.value = { type: '', text: '' }
  const { error } = await supabase.auth.updateUser({ email: newEmail.value.trim() })
  emailLoading.value = false
  if (error) {
    emailMsg.value = { type: 'danger', text: error.message }
  } else {
    emailMsg.value = { type: 'success', text: 'Un email de confirmation a été envoyé à la nouvelle adresse.' }
  }
}

// -- Password section --
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordLoading = ref(false)
const passwordMsg = ref({ type: '', text: '' })
const showCurrent = ref(false)
const showNew = ref(false)
const showConfirm = ref(false)

async function updatePassword() {
  passwordMsg.value = { type: '', text: '' }
  if (newPassword.value.length < 8) {
    passwordMsg.value = { type: 'danger', text: 'Le mot de passe doit contenir au moins 8 caractères.' }
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordMsg.value = { type: 'danger', text: 'Les mots de passe ne correspondent pas.' }
    return
  }
  passwordLoading.value = true

  // Re-authenticate first to verify current password
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: user.value.email,
    password: currentPassword.value
  })
  if (signInErr) {
    passwordLoading.value = false
    passwordMsg.value = { type: 'danger', text: 'Mot de passe actuel incorrect.' }
    return
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword.value })
  passwordLoading.value = false
  if (error) {
    passwordMsg.value = { type: 'danger', text: error.message }
  } else {
    passwordMsg.value = { type: 'success', text: 'Mot de passe mis à jour avec succès.' }
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  }
}

// -- Gestionnaires --
const isAdmin = computed(() => authService.isAdmin())
const managers = ref([])
const mgLoading = ref(false)
const mgError = ref('')
const mgSuccess = ref('')
const newMgEmail = ref('')
const newMgName = ref('')
const mgInviting = ref(false)

async function loadManagers() {
  if (!isAdmin.value) return
  mgLoading.value = true
  try {
    managers.value = await fetchManagers()
  } catch (e) {
    mgError.value = e.message
  } finally {
    mgLoading.value = false
  }
}

async function inviteMg() {
  if (!newMgEmail.value.trim()) return
  mgInviting.value = true
  mgError.value = ''
  mgSuccess.value = ''
  try {
    const mg = await inviteManager(newMgEmail.value.trim(), newMgName.value.trim())
    managers.value.push(mg)
    newMgEmail.value = ''
    newMgName.value = ''
    mgSuccess.value = 'Invitation envoyée avec succès.'
  } catch (e) {
    mgError.value = e.message
  } finally {
    mgInviting.value = false
  }
}

async function removeMg(id) {
  if (!confirm('Supprimer ce compte gestionnaire ?')) return
  try {
    await deleteManager(id)
    managers.value = managers.value.filter(m => m.id !== id)
  } catch (e) {
    mgError.value = e.message
  }
}

onMounted(() => { if (isAdmin.value) loadManagers() })
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Mon compte</h1>
        <p class="page-desc">Gérez vos informations de connexion</p>
      </div>
    </div>

    <div class="account-grid">

      <!-- Mon abonnement -->
      <div class="account-card">
        <div class="card-head">
          <div class="card-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          </div>
          <div>
            <h2 class="card-title">Mon abonnement</h2>
            <p class="card-sub">Statut et historique des paiements</p>
          </div>
        </div>
        <div class="card-body">
          <div v-if="subscription">
            <!-- Status + dates -->
            <div class="info-row">
              <span class="info-label">Statut</span>
              <span class="sub-badge" :class="statusClass(subscription.status)">{{ statusLabel(subscription.status) }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Payé jusqu'au</span>
              <span class="info-val">{{ formatDateFr(subscription.paid_until) }}</span>
            </div>
            <div v-if="subscription.monthly_price" class="info-row">
              <span class="info-label">Tarif mensuel</span>
              <span class="info-val">{{ subscription.monthly_price }} MAD/mois</span>
            </div>

            <!-- Suspended warning -->
            <div v-if="subscription.status === 'suspended' || subscription.status === 'cancelled'" class="sub-warning">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>Votre abonnement est {{ subscription.status === 'suspended' ? 'suspendu' : 'annulé' }}. Contactez-nous pour régulariser votre situation.</span>
            </div>

            <div v-if="(subscription.status === 'suspended' || subscription.status === 'cancelled') && (saasSettings.whatsapp_number || saasSettings.contact_email)" class="sub-contact-actions">
              <button v-if="saasSettings.whatsapp_number" class="sub-contact-btn whatsapp" @click="openWhatsApp">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                WhatsApp
              </button>
              <button v-if="saasSettings.contact_email" class="sub-contact-btn email" @click="openEmail">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                Email
              </button>
            </div>

            <!-- Payment history -->
            <div v-if="payments.length" class="payments-section">
              <div class="payments-title">Historique des paiements</div>
              <div class="payment-list">
                <div v-for="p in payments" :key="p.id" class="payment-row">
                  <span class="payment-date">{{ formatDateShort(p.paid_at) }}</span>
                  <span class="payment-note">{{ p.note || '—' }}</span>
                  <span class="payment-amount">{{ p.amount }} MAD</span>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="info-row">
            <span class="info-label" style="color:#94a3b8;font-style:italic;">Aucun abonnement trouvé</span>
          </div>
        </div>
      </div>

      <!-- Mon salon -->
      <div class="account-card">
        <div class="card-head">
          <div class="card-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <div>
            <h2 class="card-title">Mon salon</h2>
            <p class="card-sub">Nom et logo affichés dans l'application</p>
          </div>
        </div>
        <div class="card-body">
          <div v-if="orgMsg.text" :class="['alert', orgMsg.type]">{{ orgMsg.text }}</div>

          <!-- Logo -->
          <div class="logo-section">
            <div class="logo-preview-wrap">
              <img v-if="logoPreview || orgLogo" :src="logoPreview || orgLogo" alt="Logo" class="logo-preview" />
              <div v-else class="logo-placeholder">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              </div>
            </div>
            <div class="logo-actions">
              <label class="logo-upload-btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Choisir un logo
                <input type="file" accept="image/*" @change="onLogoChange" style="display:none" />
              </label>
              <button v-if="logoPreview || orgLogo" class="logo-remove-btn" @click="removeLogo">Supprimer</button>
              <p class="logo-hint">PNG, JPG ou SVG — max 2 Mo</p>
            </div>
          </div>

          <!-- Nom du salon -->
          <div class="field">
            <label>Nom du salon</label>
            <input v-model="orgName" type="text" placeholder="Ex: Mon Salon" />
          </div>

          <button class="btn-primary" @click="saveOrg" :disabled="orgLoading || !orgName.trim()">
            {{ orgLoading ? 'Enregistrement…' : 'Enregistrer' }}
          </button>
        </div>
      </div>

      <!-- Infos -->
      <div class="account-card">
        <div class="card-head">
          <div class="card-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <div>
            <h2 class="card-title">Profil</h2>
            <p class="card-sub">Informations du compte connecté</p>
          </div>
        </div>
        <div class="card-body">
          <div class="info-row">
            <span class="info-label">Nom</span>
            <span class="info-val">{{ user.name || '—' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Email actuel</span>
            <span class="info-val">{{ user.email || '—' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Rôle</span>
            <span class="role-badge">{{ user.role === 'superadmin' ? 'Super Admin' : 'Administrateur' }}</span>
          </div>
        </div>
      </div>

      <!-- Email -->
      <div class="account-card">
        <div class="card-head">
          <div class="card-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </div>
          <div>
            <h2 class="card-title">Adresse email</h2>
            <p class="card-sub">Modifier l'email de connexion</p>
          </div>
        </div>
        <div class="card-body">
          <div v-if="emailMsg.text" :class="['alert', emailMsg.type]">{{ emailMsg.text }}</div>
          <div class="field">
            <label>Nouvel email</label>
            <input v-model="newEmail" type="email" placeholder="votre@email.com" />
          </div>
          <button
            class="btn-primary"
            @click="updateEmail"
            :disabled="emailLoading || !newEmail.trim() || newEmail === user.email"
          >
            {{ emailLoading ? 'Mise à jour…' : 'Mettre à jour l\'email' }}
          </button>
        </div>
      </div>

      <!-- Password -->
      <div class="account-card">
        <div class="card-head">
          <div class="card-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div>
            <h2 class="card-title">Mot de passe</h2>
            <p class="card-sub">Modifier votre mot de passe</p>
          </div>
        </div>
        <div class="card-body">
          <div v-if="passwordMsg.text" :class="['alert', passwordMsg.type]">{{ passwordMsg.text }}</div>

          <div class="field">
            <label>Mot de passe actuel</label>
            <div class="input-wrap">
              <input v-model="currentPassword" :type="showCurrent ? 'text' : 'password'" placeholder="••••••••" autocomplete="current-password" />
              <button type="button" class="eye-btn" @click="showCurrent = !showCurrent" tabindex="-1">
                <svg v-if="!showCurrent" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              </button>
            </div>
          </div>

          <div class="field">
            <label>Nouveau mot de passe</label>
            <div class="input-wrap">
              <input v-model="newPassword" :type="showNew ? 'text' : 'password'" placeholder="Min. 8 caractères" autocomplete="new-password" />
              <button type="button" class="eye-btn" @click="showNew = !showNew" tabindex="-1">
                <svg v-if="!showNew" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              </button>
            </div>
          </div>

          <div class="field">
            <label>Confirmer le nouveau mot de passe</label>
            <div class="input-wrap">
              <input v-model="confirmPassword" :type="showConfirm ? 'text' : 'password'" placeholder="Répéter le mot de passe" autocomplete="new-password" />
              <button type="button" class="eye-btn" @click="showConfirm = !showConfirm" tabindex="-1">
                <svg v-if="!showConfirm" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              </button>
            </div>
          </div>

          <button
            class="btn-primary"
            @click="updatePassword"
            :disabled="passwordLoading || !currentPassword || !newPassword || !confirmPassword"
          >
            {{ passwordLoading ? 'Mise à jour…' : 'Modifier le mot de passe' }}
          </button>
        </div>
      </div>

      <!-- Gestionnaires — visible uniquement pour admin -->
      <div v-if="isAdmin" class="account-card">
        <div class="card-head">
          <div class="card-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div>
            <h2 class="card-title">Comptes gestionnaires</h2>
            <p class="card-sub">Accès complet sauf statistiques, activité et paramètres</p>
          </div>
        </div>
        <div class="card-body">

          <!-- Formulaire invitation -->
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
            <input
              v-model="newMgEmail"
              type="email"
              placeholder="Email du gestionnaire"
              class="form-input"
              style="flex:1;min-width:180px;"
              @keyup.enter="inviteMg"
            />
            <input
              v-model="newMgName"
              type="text"
              placeholder="Prénom (optionnel)"
              class="form-input"
              style="flex:1;min-width:140px;"
              @keyup.enter="inviteMg"
            />
            <button class="btn btn-primary" :disabled="!newMgEmail || mgInviting" @click="inviteMg" style="white-space:nowrap;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {{ mgInviting ? 'Envoi…' : 'Inviter' }}
            </button>
          </div>

          <div v-if="mgError" class="alert danger" style="margin-bottom:12px;">{{ mgError }}</div>
          <div v-if="mgSuccess" class="alert success" style="margin-bottom:12px;">{{ mgSuccess }}</div>

          <!-- Liste gestionnaires -->
          <div v-if="mgLoading" style="text-align:center;padding:16px;color:var(--text-muted);">Chargement…</div>
          <div v-else-if="managers.length" style="display:flex;flex-direction:column;gap:8px;">
            <div
              v-for="m in managers" :key="m.id"
              style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:#fff;"
            >
              <div style="width:34px;height:34px;border-radius:50%;background:var(--primary-soft);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--primary);flex-shrink:0;">
                {{ (m.name || m.email).charAt(0).toUpperCase() }}
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;color:var(--text-main);">{{ m.name || m.email }}</div>
                <div style="font-size:12px;color:var(--text-muted);">{{ m.email }}</div>
              </div>
              <span
                style="font-size:10px;font-weight:700;text-transform:uppercase;padding:3px 8px;border-radius:6px;flex-shrink:0;"
                :style="m.confirmed ? 'background:#dcfce7;color:#166534' : 'background:#fef3c7;color:#92400e'"
              >{{ m.confirmed ? 'Actif' : 'En attente' }}</span>
              <button
                style="width:30px;height:30px;border:none;background:transparent;color:#94a3b8;cursor:pointer;border-radius:6px;display:flex;align-items:center;justify-content:center;"
                @click="removeMg(m.id)"
                title="Supprimer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
              </button>
            </div>
          </div>
          <div v-else style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">
            Aucun gestionnaire pour le moment.
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.form-input {
  padding: 9px 12px;
  background: var(--bg-main);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13.5px;
  color: var(--text-main);
  box-sizing: border-box;
  width: 100%;
}
.form-input:focus { outline: none; border-color: var(--primary); }

.account-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 600px;
}

.account-card {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,.04);
}

.card-head {
  display: flex; align-items: center; gap: 14px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border, #f1f5f9);
  background: var(--bg-soft, #f8fafc);
}
.card-icon {
  width: 40px; height: 40px; border-radius: 10px;
  background: linear-gradient(135deg, #e0e7ff, #dbeafe);
  color: #3b82f6;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.card-title { font-size: 15px; font-weight: 800; color: var(--text-main, #0f172a); margin: 0; }
.card-sub   { font-size: 12px; color: var(--text-light, #64748b); margin: 2px 0 0; }

.card-body {
  padding: 20px 22px;
  display: flex; flex-direction: column; gap: 14px;
}

.info-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border, #f1f5f9);
}
.info-row:last-child { border-bottom: none; }
.info-label { font-size: 12.5px; font-weight: 700; color: var(--text-muted, #94a3b8); }
.info-val   { font-size: 13.5px; color: var(--text-main, #0f172a); font-weight: 500; }

.role-badge {
  display: inline-block;
  padding: 2px 10px; border-radius: 999px;
  background: #e0e7ff; color: #4338ca;
  font-size: 11.5px; font-weight: 700;
  border: 1px solid #c7d2fe;
}

.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 12.5px; font-weight: 700; color: var(--text-muted, #64748b); }

.input-wrap { position: relative; display: flex; align-items: center; }
.input-wrap input {
  flex: 1;
  padding: 9px 38px 9px 12px;
  border: 1.5px solid var(--border, #e2e8f0);
  border-radius: 9px;
  font-size: 13.5px; color: var(--text-main, #0f172a);
  background: var(--bg-soft, #f8fafc);
  transition: border-color .15s;
}
.input-wrap input:focus {
  outline: none; border-color: #6366f1;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(99,102,241,.1);
}
.field > input {
  padding: 9px 12px;
  border: 1.5px solid var(--border, #e2e8f0);
  border-radius: 9px;
  font-size: 13.5px; color: var(--text-main, #0f172a);
  background: var(--bg-soft, #f8fafc);
  transition: border-color .15s;
}
.field > input:focus {
  outline: none; border-color: #6366f1; background: #fff;
  box-shadow: 0 0 0 3px rgba(99,102,241,.1);
}

.eye-btn {
  position: absolute; right: 10px;
  background: none; border: none; cursor: pointer;
  color: var(--text-light, #94a3b8); padding: 4px;
  display: flex; align-items: center;
  transition: color .15s;
}
.eye-btn:hover { color: var(--text-main, #0f172a); }

.alert {
  padding: 9px 13px; border-radius: 8px;
  font-size: 13px; font-weight: 600;
}
.alert.success { background: #f0fdf4; color: #16a34a; border: 1px solid #86efac; }
.alert.danger  { background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; }

.btn-primary {
  padding: 10px 20px; align-self: flex-start;
  background: linear-gradient(135deg, #6366f1, #3b82f6);
  color: #fff; border: none; border-radius: 9px;
  font-size: 13.5px; font-weight: 700; cursor: pointer;
  box-shadow: 0 2px 8px rgba(99,102,241,.25);
  transition: opacity .15s;
}
.btn-primary:hover:not(:disabled) { opacity: .9; }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }

/* ── Logo salon ── */
.logo-section {
  display: flex; align-items: flex-start; gap: 16px;
}
.logo-preview-wrap {
  width: 80px; height: 80px; border-radius: 12px;
  border: 1.5px solid var(--border, #e2e8f0);
  overflow: hidden; flex-shrink: 0;
  background: var(--bg-soft, #f8fafc);
  display: flex; align-items: center; justify-content: center;
}
.logo-preview { width: 100%; height: 100%; object-fit: contain; }
.logo-placeholder { color: var(--text-muted, #94a3b8); }

.logo-actions {
  display: flex; flex-direction: column; gap: 8px; flex: 1;
}
.logo-upload-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px; border: 1.5px solid var(--border, #e2e8f0);
  border-radius: 8px; background: #fff; font-size: 13px;
  font-weight: 600; color: var(--text-main, #0f172a);
  cursor: pointer; transition: all .15s; width: fit-content;
}
.logo-upload-btn:hover { border-color: #6366f1; color: #6366f1; background: #eff6ff; }
.logo-remove-btn {
  background: none; border: none; font-size: 12.5px;
  color: #dc2626; cursor: pointer; font-weight: 600;
  padding: 0; text-align: left; width: fit-content;
}
.logo-remove-btn:hover { text-decoration: underline; }
.logo-hint { font-size: 11.5px; color: var(--text-muted, #94a3b8); margin: 0; }

/* ── Subscription badge ── */
.sub-badge {
  display: inline-block;
  padding: 3px 10px; border-radius: 999px;
  font-size: 11.5px; font-weight: 700;
}
.sub-badge--trial     { background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; }
.sub-badge--active    { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
.sub-badge--suspended { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
.sub-badge--cancelled { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }

/* ── Suspended warning ── */
.sub-warning {
  display: flex; align-items: flex-start; gap: 8px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 9px;
  padding: 10px 12px;
  font-size: 13px;
  color: #9a3412;
  font-weight: 500;
  line-height: 1.5;
}

.sub-contact-actions {
  display: flex; gap: 8px; flex-wrap: wrap;
}
.sub-contact-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px; border: none; border-radius: 8px;
  font-size: 13px; font-weight: 700; cursor: pointer;
  transition: opacity .15s;
}
.sub-contact-btn:hover { opacity: .85; }
.sub-contact-btn.whatsapp { background: #22c55e; color: #fff; }
.sub-contact-btn.email    { background: linear-gradient(135deg, #6366f1, #3b82f6); color: #fff; }

/* ── Payments ── */
.payments-section {
  display: flex; flex-direction: column; gap: 8px;
  border-top: 1px solid var(--border, #f1f5f9);
  padding-top: 12px;
  margin-top: 2px;
}
.payments-title {
  font-size: 11.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: #94a3b8;
}
.payment-list { display: flex; flex-direction: column; gap: 2px; }
.payment-row {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid var(--border, #f8fafc);
  font-size: 13px;
}
.payment-row:last-child { border-bottom: none; }
.payment-date   { color: #64748b; font-size: 12px; font-weight: 600; min-width: 90px; flex-shrink: 0; }
.payment-note   { flex: 1; color: #475569; }
.payment-amount { font-weight: 700; color: #0f172a; white-space: nowrap; }

@media (max-width: 640px) {
  .account-grid { gap: 14px; }
  .card-head, .card-body { padding: 16px; }
  .logo-section { flex-direction: column; }
}
</style>
