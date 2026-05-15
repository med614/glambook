<script setup>
import { ref, watch, computed } from 'vue'
import { updateOrganization, sendResetPassword, updateOrgEmail, resendInvite, createOrgAccount } from '@/services/organizations.service'
import { fetchSubscription, upsertSubscription, fetchPayments, addPayment, deletePayment } from '@/services/subscriptions.service'

const props = defineProps({
  org: { type: Object, required: true }
})
const emit = defineEmits(['close', 'updated'])

const tab = ref('infos')
const loading = ref(false)
const success = ref('')
const error = ref('')

// -- Infos form --
const infoForm = ref({})
watch(() => props.org, (o) => {
  infoForm.value = {
    name: o.name || '',
    type: o.type || 'salon',
    phone: o.phone || '',
    whatsapp_automation_number: o.whatsapp_automation_number || '',
    admin_name: o.admin_name || '',
    is_active: o.is_active ?? true
  }
  tab.value = 'infos'
  success.value = ''
  error.value = ''
}, { immediate: true })

async function saveInfos() {
  loading.value = true; error.value = ''; success.value = ''
  try {
    await updateOrganization(props.org.id, infoForm.value)
    success.value = 'Informations mises à jour.'
    emit('updated')
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// -- Compte form --
const newEmail = ref('')
const emailLoading = ref(false)
const emailSuccess = ref('')
const emailError = ref('')

const resetLoading = ref(false)
const resetLink = ref('')
const resetError = ref('')

const inviteLoading = ref(false)
const inviteLink = ref('')
const inviteError = ref('')

watch(() => props.org, (o) => {
  newEmail.value = o.email || ''
  emailSuccess.value = ''; emailError.value = ''
  resetLink.value = ''; resetError.value = ''
  inviteLink.value = ''; inviteError.value = ''
})

const hasAccount = computed(() => !!props.org.supabase_user_id)

// -- Créer un compte --
const createEmail = ref('')
const createLoading = ref(false)
const createLink = ref('')
const createError = ref('')

watch(() => props.org, (o) => {
  createEmail.value = o.email || ''
  createLink.value = ''
  createError.value = ''
}, { immediate: true })

async function handleCreateAccount() {
  if (!createEmail.value.trim()) return
  createLoading.value = true; createError.value = ''; createLink.value = ''
  try {
    await createOrgAccount(props.org.id, createEmail.value.trim(), props.org.admin_name)
    createLink.value = 'Compte créé — un lien d\'invitation a été généré. Recharge la liste pour voir le compte actif.'
    emit('updated')
  } catch (e) {
    createError.value = e.message
  } finally {
    createLoading.value = false
  }
}

async function changeEmail() {
  if (!newEmail.value.trim()) return
  emailLoading.value = true; emailError.value = ''; emailSuccess.value = ''
  try {
    await updateOrgEmail(props.org.supabase_user_id, props.org.id, newEmail.value.trim())
    emailSuccess.value = 'Email mis à jour.'
    emit('updated')
  } catch (e) {
    emailError.value = e.message
  } finally {
    emailLoading.value = false
  }
}

async function handleResendInvite() {
  inviteLoading.value = true; inviteError.value = ''; inviteLink.value = ''
  try {
    const res = await resendInvite(props.org.supabase_user_id)
    inviteLink.value = res.action_link || ''
  } catch (e) {
    inviteError.value = e.message
  } finally {
    inviteLoading.value = false
  }
}

async function resetPassword() {
  resetLoading.value = true; resetError.value = ''; resetLink.value = ''
  try {
    const res = await sendResetPassword(props.org.supabase_user_id)
    resetLink.value = res.action_link || ''
  } catch (e) {
    resetError.value = e.message
  } finally {
    resetLoading.value = false
  }
}

function copyLink(link) {
  navigator.clipboard.writeText(link)
}

function typeLabel(t) {
  return { salon: 'Salon', cabinet: 'Cabinet médical', spa: 'Spa', other: 'Autre' }[t] || t
}

// ── Abonnement ────────────────────────────────────────────────────────────────
const sub       = ref(null)
const payments  = ref([])
const subLoading = ref(false)
const subSaving  = ref(false)
const subMsg     = ref('')
const subError   = ref('')
const payNote    = ref('')
const payAmount  = ref('')
const showPayForm = ref(false)
const payAdding  = ref(false)

const SUB_STATUSES = [
  { value: 'trial',     label: 'Essai',    color: '#6366f1' },
  { value: 'active',    label: 'Actif',    color: '#22c55e' },
  { value: 'suspended', label: 'Suspendu', color: '#f59e0b' },
  { value: 'cancelled', label: 'Annulé',   color: '#ef4444' }
]

function subStatusMeta(status) {
  return SUB_STATUSES.find(s => s.value === status) || { label: '—', color: '#94a3b8' }
}

const paidUntilDaysLeft = computed(() => {
  if (!sub.value?.paid_until) return null
  const diff = Math.ceil((new Date(sub.value.paid_until) - new Date()) / 86400000)
  return diff
})

const paidUntilLabel = computed(() => {
  if (!sub.value?.paid_until) return 'Non défini'
  const days = paidUntilDaysLeft.value
  const date = new Date(sub.value.paid_until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  if (days < 0)  return `Expiré depuis ${Math.abs(days)} j — ${date}`
  if (days === 0) return `Expire aujourd'hui — ${date}`
  if (days <= 7)  return `Dans ${days} jour${days > 1 ? 's' : ''} — ${date}`
  return date
})

async function loadSub() {
  subLoading.value = true
  try {
    const [s, p] = await Promise.all([
      fetchSubscription(props.org.id),
      fetchPayments(props.org.id)
    ])
    sub.value      = s || { status: 'trial', paid_until: null, monthly_price: null, notes: '' }
    payments.value = p
  } finally {
    subLoading.value = false
  }
}

watch(() => props.org, () => {
  if (tab.value === 'abonnement') loadSub()
}, { immediate: false })

watch(tab, (t) => {
  if (t === 'abonnement') loadSub()
})

async function saveSub() {
  subSaving.value = true; subMsg.value = ''; subError.value = ''
  try {
    sub.value = await upsertSubscription(props.org.id, {
      status:        sub.value.status,
      paid_until:    sub.value.paid_until || null,
      monthly_price: sub.value.monthly_price || null,
      notes:         sub.value.notes || null
    })
    subMsg.value = 'Abonnement mis à jour.'
    emit('updated')
  } catch (e) {
    subError.value = e.message
  } finally {
    subSaving.value = false
  }
}

async function addOneMonth() {
  const base = sub.value?.paid_until && new Date(sub.value.paid_until) > new Date()
    ? new Date(sub.value.paid_until)
    : new Date()
  base.setMonth(base.getMonth() + 1)
  const newDate = base.toLocaleDateString('en-CA')

  if (!sub.value) sub.value = { status: 'active', paid_until: null, monthly_price: null, notes: '' }
  sub.value.paid_until = newDate
  if (sub.value.status !== 'active') sub.value.status = 'active'
  await saveSub()
}

async function handleAddPayment() {
  if (!payAmount.value) return
  payAdding.value = true
  try {
    const today = new Date().toLocaleDateString('en-CA')
    const p = await addPayment(props.org.id, {
      paid_at: today,
      amount: parseFloat(payAmount.value),
      note: payNote.value || null
    })
    payments.value.unshift(p)
    payAmount.value = ''
    payNote.value = ''
    showPayForm.value = false
  } catch (e) {
    subError.value = e.message
  } finally {
    payAdding.value = false
  }
}

async function handleDeletePayment(id) {
  if (!confirm('Supprimer ce paiement ?')) return
  await deletePayment(id)
  payments.value = payments.value.filter(p => p.id !== id)
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <Teleport to="body">
    <div class="drawer-overlay" @mousedown.self="$emit('close')">
      <div class="drawer">

        <!-- Header -->
        <div class="drawer-head">
          <div class="org-avatar-lg">{{ org.name?.charAt(0).toUpperCase() }}</div>
          <div class="drawer-head-info">
            <div class="drawer-org-name">{{ org.name }}</div>
            <div class="drawer-org-meta">
              <span class="type-chip">{{ typeLabel(org.type) }}</span>
              <span class="status-dot-pill" :class="org.is_active ? 'active' : 'suspended'">
                <span class="dot"></span>
                {{ org.is_active ? 'Active' : 'Suspendue' }}
              </span>
            </div>
          </div>
          <button class="drawer-close" @click="$emit('close')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Tabs -->
        <div class="drawer-tabs">
          <button :class="['tab', tab === 'infos' && 'active']" @click="tab = 'infos'">Informations</button>
          <button :class="['tab', tab === 'compte' && 'active']" @click="tab = 'compte'">Compte</button>
          <button :class="['tab', tab === 'abonnement' && 'active']" @click="tab = 'abonnement'">Abonnement</button>
        </div>

        <!-- Tab: Infos -->
        <div v-if="tab === 'infos'" class="drawer-body">
          <div v-if="success" class="alert success">{{ success }}</div>
          <div v-if="error" class="alert danger">{{ error }}</div>

          <div class="field">
            <label>Nom de l'organisation</label>
            <input v-model="infoForm.name" type="text" />
          </div>

          <div class="field-row">
            <div class="field">
              <label>Type</label>
              <select v-model="infoForm.type">
                <option value="salon">Salon de coiffure</option>
                <option value="cabinet">Cabinet médical</option>
                <option value="spa">Spa / Bien-être</option>
                <option value="other">Autre</option>
              </select>
            </div>
            <div class="field">
              <label>Statut</label>
              <div class="toggle-field">
                <span>{{ infoForm.is_active ? 'Active' : 'Suspendue' }}</span>
                <label class="toggle">
                  <input type="checkbox" v-model="infoForm.is_active" />
                  <span class="slider"></span>
                </label>
              </div>
            </div>
          </div>

          <div class="field-row">
            <div class="field">
              <label>Téléphone</label>
              <input v-model="infoForm.phone" type="tel" placeholder="+212 6XX XXX XXX" />
            </div>
            <div class="field">
              <label>WhatsApp</label>
              <input v-model="infoForm.whatsapp_automation_number" type="tel" placeholder="+212 6XX XXX XXX" />
            </div>
          </div>

          <div class="field">
            <label>Nom du responsable</label>
            <input v-model="infoForm.admin_name" type="text" placeholder="Ex: Fatima Zahra" />
          </div>

          <div class="meta-block">
            <span>Créée le {{ new Date(org.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) }}</span>
            <span class="meta-id">#{{ org.id.split('-')[0] }}</span>
          </div>

          <button class="btn-primary" @click="saveInfos" :disabled="loading">
            {{ loading ? 'Enregistrement…' : 'Enregistrer' }}
          </button>
        </div>

        <!-- Tab: Abonnement -->
        <div v-else-if="tab === 'abonnement'" class="drawer-body">

          <div v-if="subLoading" class="sub-loading">Chargement…</div>
          <template v-else>

            <!-- Hero statut + paid_until -->
            <div class="sub-hero" :class="'sub-hero--' + (sub?.status || 'trial')">
              <div class="sub-hero-left">
                <div class="sub-status-dot" :style="{ background: subStatusMeta(sub?.status).color }"></div>
                <div>
                  <div class="sub-status-label">{{ subStatusMeta(sub?.status).label }}</div>
                  <div class="sub-paid-until" :class="{ 'paid-expired': paidUntilDaysLeft !== null && paidUntilDaysLeft < 0, 'paid-warning': paidUntilDaysLeft !== null && paidUntilDaysLeft >= 0 && paidUntilDaysLeft <= 7 }">
                    {{ paidUntilLabel }}
                  </div>
                </div>
              </div>
              <button class="btn-add-month" @click="addOneMonth" :disabled="subSaving" title="+1 mois">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                1 mois
              </button>
            </div>

            <!-- Formulaire config -->
            <div class="sub-form-card">
              <div class="section-label">Configuration</div>

              <div class="field">
                <label>Statut</label>
                <select v-model="sub.status">
                  <option v-for="s in SUB_STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
                </select>
              </div>

              <div class="field-row">
                <div class="field">
                  <label>Payé jusqu'au</label>
                  <input v-model="sub.paid_until" type="date" />
                </div>
                <div class="field">
                  <label>Tarif mensuel (MAD)</label>
                  <input v-model="sub.monthly_price" type="number" min="0" placeholder="Ex: 299" />
                </div>
              </div>

              <div class="field">
                <label>Notes internes</label>
                <textarea v-model="sub.notes" rows="2" placeholder="Conditions particulières…"></textarea>
              </div>

              <div v-if="subMsg" class="alert success">{{ subMsg }}</div>
              <div v-if="subError" class="alert danger">{{ subError }}</div>

              <button class="btn-primary" @click="saveSub" :disabled="subSaving">
                {{ subSaving ? 'Enregistrement…' : 'Enregistrer' }}
              </button>
            </div>

            <!-- Paiements -->
            <div class="sub-payments-section">
              <div class="sub-payments-header">
                <span class="section-label">Historique des paiements</span>
                <button class="btn-add-pay" @click="showPayForm = !showPayForm">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Ajouter
                </button>
              </div>

              <!-- Mini formulaire ajout paiement -->
              <div v-if="showPayForm" class="pay-form">
                <div class="field-row">
                  <div class="field">
                    <label>Montant (MAD)</label>
                    <input v-model="payAmount" type="number" min="0" placeholder="299" autofocus />
                  </div>
                  <div class="field">
                    <label>Note</label>
                    <input v-model="payNote" type="text" placeholder="Ex: Espèces" />
                  </div>
                </div>
                <div style="display:flex;gap:8px;margin-top:4px">
                  <button class="btn-primary" style="padding:7px 16px;font-size:12.5px" @click="handleAddPayment" :disabled="payAdding || !payAmount">
                    {{ payAdding ? '…' : 'Enregistrer' }}
                  </button>
                  <button class="btn-secondary" style="padding:7px 16px;font-size:12.5px" @click="showPayForm = false">Annuler</button>
                </div>
              </div>

              <!-- Liste -->
              <div v-if="payments.length" class="pay-list">
                <div v-for="p in payments" :key="p.id" class="pay-row">
                  <div class="pay-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                  </div>
                  <div class="pay-body">
                    <div class="pay-amount">{{ p.amount ? p.amount.toLocaleString('fr-FR') + ' MAD' : '—' }}</div>
                    <div class="pay-meta">{{ formatDate(p.paid_at) }}<template v-if="p.note"> · {{ p.note }}</template></div>
                  </div>
                  <button class="pay-delete" @click="handleDeletePayment(p.id)" title="Supprimer">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                  </button>
                </div>
              </div>
              <div v-else class="pay-empty">Aucun paiement enregistré</div>
            </div>

          </template>
        </div>

        <!-- Tab: Compte -->
        <div v-else-if="tab === 'compte'" class="drawer-body">

          <div v-if="!hasAccount" class="no-account-section">
            <div class="no-account-banner">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <div>
                <strong>Aucun compte associé</strong>
                <p>Crée un compte de connexion pour cette organisation.</p>
              </div>
            </div>
            <div v-if="createError" class="alert danger">{{ createError }}</div>
            <div v-if="createLink" class="alert success">{{ createLink }}</div>
            <div class="field">
              <label>Email de connexion</label>
              <input v-model="createEmail" type="email" placeholder="admin@salon.ma" />
            </div>
            <button class="btn-primary" @click="handleCreateAccount" :disabled="createLoading || !createEmail.trim()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
              {{ createLoading ? 'Création…' : 'Créer le compte & générer le lien' }}
            </button>
          </div>

          <template v-else>

            <!-- Email section -->
            <div class="account-section">
              <p class="section-label">Adresse email</p>
              <div v-if="emailSuccess" class="alert success">{{ emailSuccess }}</div>
              <div v-if="emailError" class="alert danger">{{ emailError }}</div>
              <div class="field">
                <label>Email de connexion</label>
                <input v-model="newEmail" type="email" placeholder="admin@salon.ma" />
              </div>
              <button
                class="btn-secondary"
                @click="changeEmail"
                :disabled="emailLoading || newEmail === org.email"
              >
                {{ emailLoading ? 'Mise à jour…' : 'Mettre à jour l\'email' }}
              </button>
            </div>

            <div class="divider"></div>

            <!-- Reset password section -->
            <div class="account-section">
              <p class="section-label">Réinitialisation mot de passe</p>
              <div v-if="resetError" class="alert danger">{{ resetError }}</div>
              <p class="section-desc">Génère un lien de réinitialisation à transmettre manuellement à <strong>{{ org.email }}</strong>.</p>
              <button class="btn-warning" @click="resetPassword" :disabled="resetLoading">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                {{ resetLoading ? 'Génération…' : 'Générer le lien' }}
              </button>
              <div v-if="resetLink" class="link-box">
                <span class="link-text">{{ resetLink }}</span>
                <button class="copy-btn" @click="copyLink(resetLink)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copier
                </button>
              </div>
            </div>

            <div class="divider"></div>

            <!-- Resend invite section -->
            <div class="account-section">
              <p class="section-label">Lien d'invitation</p>
              <div v-if="inviteError" class="alert danger">{{ inviteError }}</div>
              <p class="section-desc">Génère un nouveau lien d'invitation à transmettre à <strong>{{ org.email }}</strong> pour définir son mot de passe.</p>
              <button class="btn-secondary" @click="handleResendInvite" :disabled="inviteLoading">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/>
                </svg>
                {{ inviteLoading ? 'Génération…' : 'Générer le lien d\'invitation' }}
              </button>
              <div v-if="inviteLink" class="link-box">
                <span class="link-text">{{ inviteLink }}</span>
                <button class="copy-btn" @click="copyLink(inviteLink)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copier
                </button>
              </div>
            </div>

            <div class="divider"></div>

            <!-- Account info -->
            <div class="account-meta">
              <div class="meta-row">
                <span class="meta-label">ID compte</span>
                <span class="meta-val mono">{{ org.supabase_user_id?.split('-')[0] }}…</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Email actuel</span>
                <span class="meta-val">{{ org.email || '—' }}</span>
              </div>
            </div>

          </template>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.drawer-overlay {
  position: fixed; inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
  z-index: 9998;
  display: flex; justify-content: flex-end;
}

.drawer {
  width: 420px;
  max-width: 100vw;
  height: 100%;
  background: #fff;
  display: flex; flex-direction: column;
  box-shadow: -8px 0 40px rgba(0,0,0,.15);
  animation: slideIn .22s ease;
}
@keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

/* Header */
.drawer-head {
  display: flex; align-items: center; gap: 14px;
  padding: 22px 20px 16px;
  border-bottom: 1px solid #f1f5f9;
  background: #0f172a;
  position: relative;
}
.org-avatar-lg {
  width: 46px; height: 46px; border-radius: 12px;
  background: linear-gradient(135deg, #6366f1, #3b82f6);
  color: #fff; font-size: 20px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.drawer-head-info { flex: 1; min-width: 0; }
.drawer-org-name { font-size: 16px; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.drawer-org-meta { display: flex; align-items: center; gap: 8px; margin-top: 4px; }

.type-chip {
  font-size: 10.5px; font-weight: 700;
  padding: 2px 8px; border-radius: 999px;
  background: #1e293b; color: #94a3b8;
  border: 1px solid #334155;
}
.status-dot-pill {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 10.5px; font-weight: 700;
  padding: 2px 8px; border-radius: 999px;
}
.status-dot-pill.active  { background: rgba(22,163,74,.15); color: #4ade80; }
.status-dot-pill.suspended { background: rgba(220,38,38,.15); color: #f87171; }
.dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }

.drawer-close {
  position: absolute; top: 18px; right: 18px;
  width: 32px; height: 32px;
  background: #1e293b; border: none; border-radius: 8px;
  color: #64748b; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.drawer-close:hover { background: #334155; color: #fff; }

/* Tabs */
.drawer-tabs {
  display: flex;
  border-bottom: 1px solid #f1f5f9;
  padding: 0 20px;
  background: #f8fafc;
}
.tab {
  padding: 12px 16px;
  border: none; background: transparent;
  font-size: 13px; font-weight: 700; color: #94a3b8;
  cursor: pointer; border-bottom: 2px solid transparent;
  transition: all .15s; margin-bottom: -1px;
}
.tab.active { color: #6366f1; border-bottom-color: #6366f1; }
.tab:hover:not(.active) { color: #1e293b; }

/* Body */
.drawer-body {
  flex: 1; overflow-y: auto;
  padding: 20px;
  display: flex; flex-direction: column; gap: 14px;
}

.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 12px; font-weight: 700; color: #64748b; }
.field input, .field select {
  padding: 9px 12px;
  border: 1.5px solid #e2e8f0; border-radius: 9px;
  font-size: 13.5px; color: #0f172a; background: #f8fafc;
  transition: border-color .15s;
}
.field input:focus, .field select:focus {
  outline: none; border-color: #6366f1; background: #fff;
  box-shadow: 0 0 0 3px rgba(99,102,241,.1);
}
.field-row { display: flex; gap: 12px; }
.field-row .field { flex: 1; }

.toggle-field {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 9px;
  background: #f8fafc; font-size: 13.5px; color: #0f172a; font-weight: 600;
}
.toggle { position: relative; display: inline-block; width: 38px; height: 21px; }
.toggle input { display: none; }
.slider {
  position: absolute; inset: 0;
  background: #cbd5e1; border-radius: 21px; cursor: pointer; transition: .25s;
}
.slider:before {
  content: ''; position: absolute;
  width: 15px; height: 15px; left: 3px; bottom: 3px;
  background: #fff; border-radius: 50%; transition: .25s;
  box-shadow: 0 1px 3px rgba(0,0,0,.2);
}
.toggle input:checked + .slider { background: #6366f1; }
.toggle input:checked + .slider:before { transform: translateX(17px); }

.meta-block {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px; color: #94a3b8;
  padding: 8px 0; border-top: 1px solid #f1f5f9; margin-top: 4px;
}
.meta-id { font-family: monospace; }

.alert {
  padding: 9px 12px; border-radius: 8px;
  font-size: 13px; font-weight: 600;
}
.alert.success { background: #f0fdf4; color: #16a34a; border: 1px solid #86efac; }
.alert.danger  { background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; }

.btn-primary {
  padding: 10px 20px;
  background: linear-gradient(135deg, #6366f1, #3b82f6);
  color: #fff; border: none; border-radius: 9px;
  font-size: 13.5px; font-weight: 700; cursor: pointer;
  box-shadow: 0 2px 8px rgba(99,102,241,.25);
  transition: opacity .15s;
}
.btn-primary:hover:not(:disabled) { opacity: .9; }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }

/* Compte tab */
.no-account-banner {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px;
  background: #f8fafc; color: #475569;
}
.no-account-banner svg { flex-shrink: 0; margin-top: 2px; color: #94a3b8; }
.no-account-banner strong { font-size: 14px; color: #1e293b; display: block; margin-bottom: 4px; }
.no-account-banner p { font-size: 12.5px; margin: 0; color: #64748b; }

.account-section { display: flex; flex-direction: column; gap: 10px; }
.section-label {
  font-size: 10.5px; font-weight: 800; text-transform: uppercase;
  letter-spacing: .08em; color: #94a3b8; margin: 0;
}
.section-desc { font-size: 12.5px; color: #64748b; margin: 0; line-height: 1.5; }

.divider { height: 1px; background: #f1f5f9; margin: 4px 0; }

.btn-secondary {
  padding: 9px 16px; border: 1.5px solid #e2e8f0;
  border-radius: 9px; background: #fff; color: #475569;
  font-size: 13px; font-weight: 700; cursor: pointer; transition: all .15s;
  align-self: flex-start;
}
.btn-secondary:hover:not(:disabled) { background: #f1f5f9; border-color: #cbd5e1; color: #0f172a; }
.btn-secondary:disabled { opacity: .5; cursor: not-allowed; }

.btn-warning {
  display: flex; align-items: center; gap: 7px;
  padding: 9px 16px; border: 1.5px solid #fbbf24;
  border-radius: 9px; background: #fffbeb; color: #92400e;
  font-size: 13px; font-weight: 700; cursor: pointer; transition: all .15s;
  align-self: flex-start;
}
.btn-warning:hover:not(:disabled) { background: #fef3c7; }
.btn-warning:disabled { opacity: .5; cursor: not-allowed; }

.link-box {
  display: flex; align-items: center; gap: 8px;
  background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 8px; padding: 8px 10px;
  margin-top: 2px;
}
.link-text {
  font-size: 11px; color: #475569; font-family: monospace;
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  word-break: break-all;
}
.copy-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 10px;
  background: #6366f1; color: #fff;
  border: none; border-radius: 6px;
  font-size: 11.5px; font-weight: 700; cursor: pointer;
  white-space: nowrap; flex-shrink: 0;
  transition: opacity .15s;
}
.copy-btn:hover { opacity: .85; }

.account-meta {
  background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 10px; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 8px;
}
.meta-row { display: flex; align-items: center; justify-content: space-between; }
.meta-label { font-size: 12px; font-weight: 700; color: #94a3b8; }
.meta-val { font-size: 13px; color: #475569; }
.mono { font-family: monospace; }

/* ── Abonnement ── */
.sub-loading { text-align: center; color: #94a3b8; padding: 32px; font-size: 13px; }

.sub-hero {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px; border-radius: 12px;
  border: 1.5px solid #e2e8f0;
  background: #f8fafc;
}
.sub-hero--active    { background: #f0fdf4; border-color: #86efac; }
.sub-hero--trial     { background: #eef2ff; border-color: #a5b4fc; }
.sub-hero--suspended { background: #fffbeb; border-color: #fde68a; }
.sub-hero--cancelled { background: #fef2f2; border-color: #fca5a5; }

.sub-hero-left { display: flex; align-items: center; gap: 12px; }
.sub-status-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.sub-status-label { font-size: 14px; font-weight: 800; color: #0f172a; }
.sub-paid-until { font-size: 12px; color: #64748b; margin-top: 2px; }
.sub-paid-until.paid-expired { color: #dc2626; font-weight: 700; }
.sub-paid-until.paid-warning { color: #d97706; font-weight: 700; }

.btn-add-month {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 8px;
  background: #0f172a; color: #fff; border: none;
  font-size: 12.5px; font-weight: 700; cursor: pointer;
  white-space: nowrap; flex-shrink: 0; transition: opacity .15s;
}
.btn-add-month:hover:not(:disabled) { opacity: .85; }
.btn-add-month:disabled { opacity: .5; cursor: not-allowed; }

.sub-form-card {
  background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 12px; padding: 16px;
  display: flex; flex-direction: column; gap: 12px;
}
.sub-form-card textarea {
  padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 9px;
  font-size: 13px; color: #0f172a; resize: vertical; font-family: inherit;
  background: #fff; transition: border-color .15s;
}
.sub-form-card textarea:focus { outline: none; border-color: #6366f1; }

.sub-payments-section { display: flex; flex-direction: column; gap: 10px; }
.sub-payments-header { display: flex; align-items: center; justify-content: space-between; }

.btn-add-pay {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 12px; border: 1.5px solid #6366f1;
  border-radius: 7px; background: #eef2ff; color: #4f46e5;
  font-size: 12px; font-weight: 700; cursor: pointer; transition: all .12s;
}
.btn-add-pay:hover { background: #e0e7ff; }

.pay-form {
  background: #f8fafc; border: 1.5px solid #e2e8f0;
  border-radius: 10px; padding: 12px;
  display: flex; flex-direction: column; gap: 10px;
}

.pay-list { display: flex; flex-direction: column; gap: 6px; }
.pay-row {
  display: flex; align-items: center; gap: 10px;
  background: #fff; border: 1px solid #e2e8f0;
  border-radius: 9px; padding: 10px 12px;
}
.pay-icon {
  width: 30px; height: 30px; border-radius: 8px;
  background: #f1f5f9; color: #64748b;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.pay-body { flex: 1; min-width: 0; }
.pay-amount { font-size: 14px; font-weight: 800; color: #0f172a; }
.pay-meta { font-size: 11.5px; color: #94a3b8; margin-top: 1px; }
.pay-delete {
  width: 28px; height: 28px; border-radius: 7px;
  border: 1.5px solid #fca5a5; background: transparent;
  color: #dc2626; cursor: pointer; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  transition: all .12s;
}
.pay-delete:hover { background: #fee2e2; }
.pay-empty { text-align: center; font-size: 12.5px; color: #94a3b8; padding: 20px; font-style: italic; }

/* ── Responsive ── */
@media (max-width: 600px) {
  .drawer {
    width: 100vw;
    border-radius: 0;
  }
  .drawer-head { padding: 16px 16px 14px; }
  .drawer-close { top: 14px; right: 14px; }
  .drawer-body  { padding: 16px; }

  .field-row { flex-direction: column; gap: 10px; }

  .btn-primary,
  .btn-secondary,
  .btn-warning { width: 100%; justify-content: center; align-self: stretch; }

  .link-box { flex-direction: column; align-items: stretch; gap: 8px; }
  .link-text { white-space: normal; word-break: break-all; }
  .copy-btn  { justify-content: center; }
}
</style>
