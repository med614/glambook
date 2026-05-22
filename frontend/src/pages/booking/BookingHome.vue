<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const router = useRouter()

const orgs = ref([])
const loading = ref(true)
const search = ref('')
const selectedOrg = ref(null)
const name = ref('')
const lastName = ref('')
const phone = ref('')
const step = ref('org') // 'org' | 'info'
const error = ref('')

onMounted(async () => {
  try {
    const res = await fetch(`${API}/booking/orgs`)
    orgs.value = await res.json()
    if (orgs.value.length === 1) {
      selectedOrg.value = orgs.value[0]
      step.value = 'info'
    }
  } catch (e) {
    error.value = 'Impossible de charger les salons.'
  } finally {
    loading.value = false
  }
})

const filteredOrgs = computed(() => {
  if (!search.value) return orgs.value
  const q = search.value.toLowerCase()
  return orgs.value.filter(o =>
    o.name.toLowerCase().includes(q) || (o.city || '').toLowerCase().includes(q)
  )
})

function selectOrg(org) {
  selectedOrg.value = org
  step.value = 'info'
}

function goBack() {
  step.value = 'org'
  selectedOrg.value = null
}

function formatPhone(val) {
  return val.replace(/[^\d+\s()-]/g, '')
}

function proceed() {
  error.value = ''
  if (!name.value.trim()) { error.value = 'Veuillez entrer votre prénom.'; return }
  if (!phone.value.trim()) { error.value = 'Veuillez entrer votre numéro de téléphone.'; return }
  router.push({
    path: `/booking/${selectedOrg.value.id}`,
    query: {
      name: name.value.trim(),
      last_name: lastName.value.trim(),
      phone: phone.value.trim()
    }
  })
}
</script>

<template>
  <div class="bk-layout">
    <div class="bk-card">

      <!-- Logo + titre -->
      <div class="bk-header">
        <div class="bk-logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <h1 class="bk-title">Prendre un rendez-vous</h1>
        <p class="bk-sub">Réservez en ligne, sans inscription</p>
      </div>

      <!-- Step 1 : choix org -->
      <template v-if="step === 'org'">
        <div class="bk-step-label">Choisissez votre salon</div>

        <div v-if="loading" class="bk-loading">
          <div class="bk-spinner"></div>
          <span>Chargement…</span>
        </div>

        <template v-else>
          <div v-if="orgs.length > 4" class="bk-search-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input v-model="search" type="text" placeholder="Rechercher un salon…" class="bk-search" />
          </div>

          <div class="bk-org-list">
            <button
              v-for="org in filteredOrgs" :key="org.id"
              class="bk-org-item"
              @click="selectOrg(org)"
            >
              <div v-if="org.logo_url" class="bk-org-logo">
                <img :src="org.logo_url" :alt="org.name" />
              </div>
              <div v-else class="bk-org-avatar">{{ org.name.charAt(0) }}</div>
              <div class="bk-org-info">
                <div class="bk-org-name">{{ org.name }}</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--text-light);flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
            </button>

            <div v-if="!filteredOrgs.length" style="text-align:center;padding:32px;color:var(--text-light);font-size:14px;">
              Aucun salon trouvé.
            </div>
          </div>
        </template>
      </template>

      <!-- Step 2 : infos client -->
      <template v-else>
        <button class="bk-back" @click="goBack" v-if="orgs.length > 1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Changer de salon
        </button>

        <div class="bk-selected-org" v-if="selectedOrg">
          <div v-if="selectedOrg.logo_url" class="bk-org-logo-sm">
            <img :src="selectedOrg.logo_url" :alt="selectedOrg.name" />
          </div>
          <div v-else class="bk-org-avatar-sm">{{ selectedOrg.name.charAt(0) }}</div>
          <span class="bk-selected-name">{{ selectedOrg.name }}</span>
        </div>

        <div class="bk-step-label" style="margin-top:20px;">Vos coordonnées</div>

        <div class="bk-form">
          <div class="bk-row">
            <div class="bk-field">
              <label>Prénom *</label>
              <input v-model="name" type="text" placeholder="Votre prénom" @keyup.enter="proceed" />
            </div>
            <div class="bk-field">
              <label>Nom</label>
              <input v-model="lastName" type="text" placeholder="Votre nom" @keyup.enter="proceed" />
            </div>
          </div>
          <div class="bk-field">
            <label>Téléphone *</label>
            <input
              v-model="phone"
              type="tel"
              placeholder="Ex: 0661234567"
              @keyup.enter="proceed"
            />
          </div>

          <div v-if="error" class="bk-error">{{ error }}</div>

          <button class="bk-btn-primary" @click="proceed" :disabled="!name || !phone">
            Choisir mon créneau
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </template>

      <!-- Lien retour connexion -->
      <div class="bk-footer-link">
        <router-link to="/login">← Espace salon / connexion</router-link>
      </div>

    </div>
  </div>
</template>

<style scoped>
.bk-layout {
  min-height: 100vh;
  background: var(--bg-main);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
}

.bk-card {
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 8px 40px rgba(0,0,0,.10);
  padding: 36px 32px;
  width: 100%;
  max-width: 480px;
}

.bk-header {
  text-align: center;
  margin-bottom: 28px;
}
.bk-logo {
  width: 56px; height: 56px;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  margin: 0 auto 14px;
}
.bk-title { font-size: 22px; font-weight: 800; color: var(--text-main); margin: 0 0 4px; }
.bk-sub { font-size: 13.5px; color: var(--text-muted); margin: 0; }

.bk-step-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--text-light);
  margin-bottom: 12px;
}

.bk-loading {
  display: flex; align-items: center; gap: 12px;
  justify-content: center; padding: 32px;
  color: var(--text-muted); font-size: 14px;
}
.bk-spinner {
  width: 20px; height: 20px;
  border: 2px solid var(--border-strong);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.bk-search-wrap {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-main); border: 1px solid var(--border-strong);
  border-radius: 10px; padding: 0 12px;
  margin-bottom: 12px;
}
.bk-search {
  flex: 1; border: none; background: transparent;
  padding: 10px 0; font-size: 14px; outline: none;
}

.bk-org-list { display: flex; flex-direction: column; gap: 8px; }

.bk-org-item {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 16px;
  border: 1.5px solid var(--border-strong); border-radius: 12px;
  background: #fff; cursor: pointer;
  transition: border-color .15s, box-shadow .15s;
  text-align: left; width: 100%;
}
.bk-org-item:hover { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-glow); }

.bk-org-logo {
  width: 42px; height: 42px; border-radius: 10px;
  overflow: hidden; flex-shrink: 0; background: var(--bg-soft);
}
.bk-org-logo img { width: 100%; height: 100%; object-fit: contain; }
.bk-org-avatar {
  width: 42px; height: 42px; border-radius: 10px;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: #fff; font-size: 18px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.bk-org-info { flex: 1; min-width: 0; }
.bk-org-name { font-size: 14.5px; font-weight: 700; color: var(--text-main); }
.bk-org-city { font-size: 12px; color: var(--text-light); margin-top: 1px; }

/* Step 2 */
.bk-back {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12.5px; font-weight: 600; color: var(--primary);
  background: none; border: none; cursor: pointer; padding: 0;
  margin-bottom: 16px;
}

.bk-selected-org {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px;
  background: var(--bg-main); border: 1px solid var(--border-strong); border-radius: 12px;
  margin-bottom: 4px;
}
.bk-org-logo-sm { width: 32px; height: 32px; border-radius: 8px; overflow: hidden; }
.bk-org-logo-sm img { width: 100%; height: 100%; object-fit: contain; }
.bk-org-avatar-sm {
  width: 32px; height: 32px; border-radius: 8px;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: #fff; font-size: 14px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.bk-selected-name { font-size: 14px; font-weight: 700; color: var(--text-main); }

.bk-form { display: flex; flex-direction: column; gap: 14px; margin-top: 8px; }
.bk-row { display: flex; gap: 12px; }
.bk-field { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.bk-field label { font-size: 12.5px; font-weight: 600; color: var(--text-muted); }
.bk-field input {
  padding: 10px 13px;
  border: 1.5px solid var(--border-strong); border-radius: 10px;
  font-size: 14px; color: var(--text-main); outline: none;
  transition: border-color .15s;
}
.bk-field input:focus { border-color: var(--primary); }

.bk-error {
  background: #fef2f2; border: 1px solid #fca5a5;
  color: #dc2626; font-size: 13px; padding: 10px 13px;
  border-radius: 8px;
}

.bk-btn-primary {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: #fff; border: none; border-radius: 12px;
  padding: 13px 20px; font-size: 14.5px; font-weight: 700;
  cursor: pointer; transition: opacity .15s;
}
.bk-btn-primary:hover { opacity: .9; }
.bk-btn-primary:disabled { opacity: .5; cursor: not-allowed; }

.bk-footer-link {
  text-align: center; margin-top: 24px;
  font-size: 13px;
}
.bk-footer-link a { color: var(--text-light); text-decoration: none; }
.bk-footer-link a:hover { color: var(--primary); }
</style>
