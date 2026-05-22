<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { authService } from '@/services/auth.service'
import { fetchSaasSettings, updateSaasSettings } from '@/services/saasConfig.service'

const router = useRouter()

const user      = ref(null)
const fullName  = ref('')
const email     = ref('')
const saving    = ref(false)
const saveMsg   = ref('')

const pwdCurrent = ref('')
const pwdNew     = ref('')
const pwdConfirm = ref('')
const pwdSaving  = ref(false)
const pwdMsg     = ref('')
const pwdError   = ref('')

// -- Contact settings --
const contactWhatsapp = ref('')
const contactEmail    = ref('')
const contactSaving   = ref(false)
const contactMsg      = ref('')
const contactError    = ref('')

async function loadContactSettings() {
  const s = await fetchSaasSettings()
  contactWhatsapp.value = s.whatsapp_number || ''
  contactEmail.value    = s.contact_email   || ''
}

async function saveContactSettings() {
  contactMsg.value   = ''
  contactError.value = ''
  contactSaving.value = true
  try {
    await updateSaasSettings({
      whatsapp_number: contactWhatsapp.value.trim(),
      contact_email:   contactEmail.value.trim()
    })
    contactMsg.value = 'Coordonnées mises à jour.'
  } catch (e) {
    contactError.value = 'Erreur : ' + (e.message || JSON.stringify(e))
  } finally {
    contactSaving.value = false
  }
}

async function load() {
  const { data } = await supabase.auth.getUser()
  if (!data?.user) return
  user.value    = data.user
  email.value   = data.user.email ?? ''
  fullName.value = data.user.user_metadata?.full_name ?? ''
  await loadContactSettings()
}

async function saveProfile() {
  saving.value = true
  saveMsg.value = ''
  try {
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName.value }
    })
    if (error) throw error
    saveMsg.value = 'Profil mis à jour.'
  } catch (e) {
    saveMsg.value = 'Erreur : ' + (e.message || JSON.stringify(e))
  } finally {
    saving.value = false
  }
}

async function changePassword() {
  pwdError.value = ''
  pwdMsg.value   = ''
  if (!pwdNew.value) { pwdError.value = 'Nouveau mot de passe requis.'; return }
  if (pwdNew.value !== pwdConfirm.value) { pwdError.value = 'Les mots de passe ne correspondent pas.'; return }
  if (pwdNew.value.length < 8) { pwdError.value = 'Au moins 8 caractères requis.'; return }

  pwdSaving.value = true
  try {
    const { error } = await supabase.auth.updateUser({ password: pwdNew.value })
    if (error) throw error
    pwdMsg.value     = 'Mot de passe mis à jour.'
    pwdCurrent.value = ''
    pwdNew.value     = ''
    pwdConfirm.value = ''
  } catch (e) {
    pwdError.value = 'Erreur : ' + (e.message || JSON.stringify(e))
  } finally {
    pwdSaving.value = false
  }
}

function logout() {
  authService.logout()
  router.push('/login')
}

onMounted(load)
</script>

<template>
  <div class="saas-layout">

    <!-- Topbar -->
    <header class="saas-topbar">
      <div class="saas-brand">
        <div class="saas-brand-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        </div>
        <div class="saas-brand-text">
          <span class="saas-brand-name">Glambook</span>
          <span class="saas-brand-tag">Administration</span>
        </div>
      </div>

      <nav class="saas-nav">
        <router-link to="/saas/organizations" class="saas-nav-link">Organisations</router-link>
        <router-link to="/saas/account" class="saas-nav-link">Mon compte</router-link>
      </nav>

      <div class="saas-topbar-right">
        <button class="saas-logout" @click="logout" title="Déconnexion">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Déconnexion
        </button>
      </div>
    </header>

    <!-- Body -->
    <main class="saas-main">

      <div class="saas-page-header">
        <div>
          <h1 class="saas-page-title">Mon compte</h1>
          <p class="saas-page-desc">Gérez votre profil et votre mot de passe administrateur</p>
        </div>
      </div>

      <!-- Avatar + email readonly -->
      <div class="account-hero">
        <div class="account-avatar">
          {{ fullName?.charAt(0)?.toUpperCase() || email?.charAt(0)?.toUpperCase() || 'S' }}
        </div>
        <div>
          <div class="account-name">{{ fullName || 'Super Admin' }}</div>
          <div class="account-email">{{ email }}</div>
          <span class="account-role-badge">Super Administrateur</span>
        </div>
      </div>

      <!-- Profil -->
      <div class="saas-card">
        <div class="card-section-title">Informations personnelles</div>
        <div class="card-body">
          <div class="form-group">
            <label>Nom complet</label>
            <input v-model="fullName" type="text" placeholder="Votre nom…" />
          </div>
          <div class="form-group">
            <label>Adresse e-mail</label>
            <input :value="email" type="email" disabled class="input-disabled" />
            <p class="field-hint">L'adresse e-mail ne peut pas être modifiée ici.</p>
          </div>

          <div class="form-footer">
            <span v-if="saveMsg" class="form-msg">{{ saveMsg }}</span>
            <button class="saas-btn-primary" :disabled="saving" @click="saveProfile">
              {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Coordonnées de contact -->
      <div class="saas-card">
        <div class="card-section-title">Coordonnées de contact</div>
        <div class="card-body">
          <p class="field-hint" style="margin:0;font-size:13px;color:var(--text-muted);">
            Ces informations sont affichées aux organisations dont l'abonnement est suspendu.
          </p>
          <div class="form-group">
            <label>Numéro WhatsApp</label>
            <input v-model="contactWhatsapp" type="text" placeholder="+212 6XX XXX XXX" />
          </div>
          <div class="form-group">
            <label>Email de contact</label>
            <input v-model="contactEmail" type="email" placeholder="contact@example.com" />
          </div>
          <div class="form-footer">
            <span v-if="contactError" class="form-msg error">{{ contactError }}</span>
            <span v-else-if="contactMsg" class="form-msg">{{ contactMsg }}</span>
            <button class="saas-btn-primary" :disabled="contactSaving" @click="saveContactSettings">
              {{ contactSaving ? 'Enregistrement…' : 'Enregistrer' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Mot de passe -->
      <div class="saas-card">
        <div class="card-section-title">Changer le mot de passe</div>
        <div class="card-body">
          <div class="form-group">
            <label>Nouveau mot de passe</label>
            <input v-model="pwdNew" type="password" placeholder="••••••••" autocomplete="new-password" />
          </div>
          <div class="form-group">
            <label>Confirmer le nouveau mot de passe</label>
            <input v-model="pwdConfirm" type="password" placeholder="••••••••" autocomplete="new-password" />
          </div>

          <div class="form-footer">
            <span v-if="pwdError" class="form-msg error">{{ pwdError }}</span>
            <span v-else-if="pwdMsg" class="form-msg">{{ pwdMsg }}</span>
            <button class="saas-btn-primary" :disabled="pwdSaving" @click="changePassword">
              {{ pwdSaving ? 'Mise à jour…' : 'Mettre à jour' }}
            </button>
          </div>
        </div>
      </div>

    </main>
  </div>
</template>

<style scoped>
.saas-layout {
  min-height: 100vh;
  background: var(--bg-soft);
  display: flex;
  flex-direction: column;
}

/* Topbar */
.saas-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  height: 64px;
  background: var(--text-main);
  border-bottom: 1px solid var(--bg-soft);
  position: sticky;
  top: 0;
  z-index: 100;
  gap: 24px;
}

.saas-brand { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.saas-brand-icon {
  width: 36px; height: 36px;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
}
.saas-brand-text { display: flex; flex-direction: column; }
.saas-brand-name { font-size: 15px; font-weight: 800; color: #fff; letter-spacing: -.3px; }
.saas-brand-tag  { font-size: 10px; font-weight: 600; color: var(--primary); text-transform: uppercase; letter-spacing: .08em; }

.saas-nav { display: flex; align-items: center; gap: 4px; flex: 1; }
.saas-nav-link {
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 13px; font-weight: 600;
  color: var(--text-light);
  text-decoration: none;
  transition: all .15s;
}
.saas-nav-link:hover { color: #fff; background: var(--primary-soft); }
.saas-nav-link.router-link-active { color: #fff; background: var(--primary-soft); }

.saas-topbar-right { display: flex; align-items: center; gap: 20px; flex-shrink: 0; }

.saas-logout {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px;
  background: transparent;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  color: var(--text-light);
  font-size: 12.5px; font-weight: 600;
  cursor: pointer;
  transition: all .15s;
}
.saas-logout:hover { background: var(--primary-soft); color: #fff; border-color: var(--primary-mid); }

/* Main */
.saas-main {
  flex: 1;
  padding: 32px;
  max-width: 700px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.saas-page-header { margin-bottom: 4px; }
.saas-page-title { font-size: 22px; font-weight: 800; color: var(--text-main); margin: 0; }
.saas-page-desc  { font-size: 13px; color: var(--text-muted); margin: 4px 0 0; }

/* Hero */
.account-hero {
  display: flex;
  align-items: center;
  gap: 18px;
  background: linear-gradient(135deg, var(--text-main), #2A2618);
  border-radius: 16px;
  padding: 24px 28px;
}
.account-avatar {
  width: 60px; height: 60px; border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: #fff; font-size: 24px; font-weight: 800;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.account-name  { font-size: 18px; font-weight: 700; color: #fff; }
.account-email { font-size: 13px; color: var(--text-light); margin-top: 2px; }
.account-role-badge {
  display: inline-block; margin-top: 8px;
  padding: 3px 10px;
  background: var(--primary-soft);
  border: 1px solid var(--primary-glow);
  border-radius: 999px;
  font-size: 11px; font-weight: 700; color: var(--primary);
  text-transform: uppercase; letter-spacing: .06em;
}

/* Card */
.saas-card {
  background: #fff;
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,.04);
}
.card-section-title {
  padding: 16px 24px;
  font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .07em; color: var(--text-muted);
  border-bottom: 1px solid var(--bg-soft);
  background: var(--bg-main);
}
.card-body { padding: 24px; display: flex; flex-direction: column; gap: 18px; }

/* Form */
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12.5px; font-weight: 700; color: var(--text-muted); }
.form-group input {
  height: 40px;
  border: 1.5px solid var(--border-strong);
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13.5px;
  color: var(--text-main);
  background: #fff;
  outline: none;
  transition: border-color .15s;
}
.form-group input:focus { border-color: var(--primary); }
.input-disabled { background: var(--bg-main) !important; color: var(--text-light) !important; cursor: not-allowed; }
.field-hint { font-size: 11.5px; color: var(--text-light); margin: 0; }

.form-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 12px;
  padding-top: 4px;
}
.form-msg { font-size: 12.5px; color: #16a34a; font-weight: 600; flex: 1; }
.form-msg.error { color: #dc2626; }

.saas-btn-primary {
  display: flex; align-items: center; gap: 7px;
  padding: 10px 20px;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 13.5px; font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 2px 8px var(--primary-glow);
  transition: opacity .15s;
}
.saas-btn-primary:disabled { opacity: .6; cursor: not-allowed; }
.saas-btn-primary:hover:not(:disabled) { opacity: .9; }

@media (max-width: 600px) {
  .saas-topbar { padding: 0 16px; height: 56px; }
  .saas-brand-tag { display: none; }
  .saas-main { padding: 16px; gap: 16px; }
  .account-hero { padding: 16px; }
  .card-body { padding: 16px; }
}
</style>
