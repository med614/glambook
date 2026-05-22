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
const sub        = ref(null)
const payments   = ref([])
const subLoading = ref(false)
const subError   = ref('')
const subMsg     = ref('')

// Paiement rapide
const payAmount   = ref('')
const payNote     = ref('')
const payMonths   = ref(1)
const payAdding   = ref(false)

// Essai
const trialDays    = ref(14)
const showTrialPicker = ref(false)
const trialSaving  = ref(false)

// Paramètres (accordéon)
const showConfig   = ref(false)
const configSaving = ref(false)

const STATUS_META = {
  trial:     { label: 'Essai',    color: 'var(--primary)', bg: 'var(--primary-soft)', border: 'var(--primary-mid)' },
  active:    { label: 'Actif',    color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
  suspended: { label: 'Suspendu', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  cancelled: { label: 'Annulé',   color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
}

function statusMeta(s) {
  return STATUS_META[s] || { label: '—', color: 'var(--text-light)', bg: 'var(--bg-main)', border: 'var(--border-strong)' }
}

const daysLeft = computed(() => {
  if (!sub.value?.paid_until) return null
  return Math.ceil((new Date(sub.value.paid_until) - new Date()) / 86400000)
})

const expiryLabel = computed(() => {
  if (!sub.value?.paid_until) return 'Aucune date d\'expiration'
  const d = daysLeft.value
  const date = new Date(sub.value.paid_until + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  if (d < 0)   return `Expiré depuis ${Math.abs(d)} jour${Math.abs(d) > 1 ? 's' : ''}`
  if (d === 0) return `Expire aujourd'hui`
  if (d <= 7)  return `Expire dans ${d} jour${d > 1 ? 's' : ''}`
  return `Expire le ${date}`
})

const totalEncaisse = computed(() =>
  payments.value.reduce((s, p) => s + (p.amount || 0), 0)
)

async function loadSub() {
  subLoading.value = true
  try {
    const [s, p] = await Promise.all([fetchSubscription(props.org.id), fetchPayments(props.org.id)])
    sub.value      = s || { status: 'trial', paid_until: null, monthly_price: null, notes: '' }
    payments.value = p
  } finally {
    subLoading.value = false
  }
}

watch(() => props.org, () => { if (tab.value === 'abonnement') loadSub() })
watch(tab, t => { if (t === 'abonnement') loadSub() })

// Enregistrer un paiement + prolonger l'abo
async function handlePayment() {
  if (!payAmount.value) return
  payAdding.value = true; subError.value = ''
  try {
    const today = new Date().toLocaleDateString('en-CA')
    const p = await addPayment(props.org.id, {
      paid_at: today,
      amount: parseFloat(payAmount.value),
      note: payNote.value || null
    })
    payments.value.unshift(p)

    // Prolonger l'abonnement
    const base = sub.value?.paid_until && new Date(sub.value.paid_until) > new Date()
      ? new Date(sub.value.paid_until + 'T12:00:00')
      : new Date()
    base.setMonth(base.getMonth() + parseInt(payMonths.value))
    sub.value = await upsertSubscription(props.org.id, {
      status: 'active',
      paid_until: base.toLocaleDateString('en-CA'),
      monthly_price: sub.value?.monthly_price || null,
      notes: sub.value?.notes || null
    })

    payAmount.value = ''; payNote.value = ''; payMonths.value = 1
    subMsg.value = 'Paiement enregistré · abonnement prolongé.'
    setTimeout(() => subMsg.value = '', 3000)
    emit('updated')
  } catch (e) {
    subError.value = e.message
  } finally {
    payAdding.value = false
  }
}

// Démarrer un essai
async function startTrial() {
  trialSaving.value = true; subError.value = ''
  try {
    const end = new Date()
    end.setDate(end.getDate() + parseInt(trialDays.value))
    sub.value = await upsertSubscription(props.org.id, {
      status: 'trial',
      paid_until: end.toLocaleDateString('en-CA'),
      monthly_price: sub.value?.monthly_price || null,
      notes: sub.value?.notes || null
    })
    showTrialPicker.value = false
    subMsg.value = `Essai démarré — ${trialDays.value} jours.`
    setTimeout(() => subMsg.value = '', 3000)
    emit('updated')
  } catch (e) {
    subError.value = e.message
  } finally {
    trialSaving.value = false
  }
}

// Suspendre / Réactiver
async function setStatus(status) {
  subError.value = ''
  try {
    sub.value = await upsertSubscription(props.org.id, {
      status,
      paid_until: sub.value?.paid_until || null,
      monthly_price: sub.value?.monthly_price || null,
      notes: sub.value?.notes || null
    })
    subMsg.value = status === 'suspended' ? 'Abonnement suspendu.' : 'Abonnement réactivé.'
    setTimeout(() => subMsg.value = '', 3000)
    emit('updated')
  } catch (e) {
    subError.value = e.message
  }
}

// Sauvegarder config (tarif + notes)
async function saveConfig() {
  configSaving.value = true; subError.value = ''
  try {
    sub.value = await upsertSubscription(props.org.id, {
      status: sub.value.status,
      paid_until: sub.value.paid_until || null,
      monthly_price: sub.value.monthly_price || null,
      notes: sub.value.notes || null
    })
    subMsg.value = 'Paramètres mis à jour.'
    setTimeout(() => subMsg.value = '', 3000)
  } catch (e) {
    subError.value = e.message
  } finally {
    configSaving.value = false
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

            <!-- Feedback -->
            <div v-if="subMsg"   class="alert success">{{ subMsg }}</div>
            <div v-if="subError" class="alert danger">{{ subError }}</div>

            <!-- ── Hero statut ── -->
            <div class="sub-hero2" :style="{ background: statusMeta(sub?.status).bg, borderColor: statusMeta(sub?.status).border }">
              <div class="sub-hero2-top">
                <div class="sub-status-badge" :style="{ background: statusMeta(sub?.status).color }">
                  {{ statusMeta(sub?.status).label }}
                </div>
                <div class="sub-expiry" :class="{
                  'expiry-ok':      daysLeft !== null && daysLeft > 7,
                  'expiry-warn':    daysLeft !== null && daysLeft >= 0 && daysLeft <= 7,
                  'expiry-expired': daysLeft !== null && daysLeft < 0
                }">{{ expiryLabel }}</div>
              </div>
              <div v-if="sub?.paid_until" class="sub-date-line">
                {{ new Date(sub.paid_until + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) }}
                <template v-if="sub.monthly_price"> · {{ sub.monthly_price }} MAD/mois</template>
              </div>

              <!-- Actions rapides -->
              <div class="sub-quick-actions">
                <!-- Essai -->
                <div class="trial-wrap">
                  <button class="qa-btn qa-btn--purple" @click="showTrialPicker = !showTrialPicker">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Essai
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <div v-if="showTrialPicker" class="trial-picker">
                    <span class="trial-picker-label">Durée de l'essai</span>
                    <div class="trial-days-row">
                      <button v-for="d in [7,14,30]" :key="d" class="trial-day-btn" :class="{ active: trialDays == d }" @click="trialDays = d">{{ d }}j</button>
                    </div>
                    <button class="qa-btn qa-btn--purple" style="width:100%;justify-content:center;margin-top:4px" @click="startTrial" :disabled="trialSaving">
                      {{ trialSaving ? '…' : 'Démarrer l\'essai' }}
                    </button>
                  </div>
                </div>

                <!-- Suspendre / Réactiver -->
                <button v-if="sub?.status !== 'suspended'" class="qa-btn qa-btn--gray" @click="setStatus('suspended')">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  Suspendre
                </button>
                <button v-else class="qa-btn qa-btn--green" @click="setStatus('active')">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Réactiver
                </button>
              </div>
            </div>

            <!-- ── Enregistrer un paiement ── -->
            <div class="pay-card">
              <div class="pay-card-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                Enregistrer un paiement
              </div>
              <div class="pay-card-row">
                <div class="field" style="flex:1">
                  <label>Montant (MAD)</label>
                  <input v-model="payAmount" type="number" min="0" placeholder="299" />
                </div>
                <div class="field" style="flex:1">
                  <label>Prolongation</label>
                  <select v-model="payMonths">
                    <option :value="1">1 mois</option>
                    <option :value="2">2 mois</option>
                    <option :value="3">3 mois</option>
                    <option :value="6">6 mois</option>
                    <option :value="12">1 an</option>
                  </select>
                </div>
              </div>
              <div class="field">
                <label>Note (optionnel)</label>
                <input v-model="payNote" type="text" placeholder="Ex: Espèces, Virement…" />
              </div>
              <button class="btn-pay-submit" @click="handlePayment" :disabled="payAdding || !payAmount">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                {{ payAdding ? 'Enregistrement…' : 'Enregistrer & renouveler l\'abonnement' }}
              </button>
            </div>

            <!-- ── Paramètres (accordéon) ── -->
            <div class="config-accordion">
              <button class="config-accordion-trigger" @click="showConfig = !showConfig">
                <span>Paramètres</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" :style="{ transform: showConfig ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s' }"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div v-if="showConfig" class="config-accordion-body">
                <div class="field-row">
                  <div class="field">
                    <label>Payé jusqu'au</label>
                    <input v-model="sub.paid_until" type="date" />
                  </div>
                  <div class="field">
                    <label>Tarif mensuel (MAD)</label>
                    <input v-model="sub.monthly_price" type="number" min="0" placeholder="299" />
                  </div>
                </div>
                <div class="field">
                  <label>Notes internes</label>
                  <textarea v-model="sub.notes" rows="2" placeholder="Conditions particulières…"></textarea>
                </div>
                <button class="btn-primary" @click="saveConfig" :disabled="configSaving" style="align-self:flex-start">
                  {{ configSaving ? '…' : 'Enregistrer' }}
                </button>
              </div>
            </div>

            <!-- ── Historique des paiements ── -->
            <div class="pay-history">
              <div class="pay-history-header">
                <span class="section-label">Historique</span>
                <span v-if="totalEncaisse > 0" class="pay-total">Total : {{ totalEncaisse.toLocaleString('fr-FR') }} MAD</span>
              </div>

              <div v-if="payments.length" class="pay-timeline">
                <div v-for="p in payments" :key="p.id" class="pay-tl-row">
                  <div class="pay-tl-dot"></div>
                  <div class="pay-tl-body">
                    <div class="pay-tl-amount">{{ p.amount ? p.amount.toLocaleString('fr-FR') + ' MAD' : '—' }}</div>
                    <div class="pay-tl-meta">{{ formatDate(p.paid_at) }}<template v-if="p.note"> · {{ p.note }}</template></div>
                  </div>
                  <button class="pay-delete" @click="handleDeletePayment(p.id)" title="Supprimer">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
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
  background: rgba(28,26,16,.45);
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
  border-bottom: 1px solid var(--bg-soft);
  background: var(--text-main);
  position: relative;
}
.org-avatar-lg {
  width: 46px; height: 46px; border-radius: 12px;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
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
  background: var(--bg-soft); color: var(--text-light);
  border: 1px solid var(--border-strong);
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
  background: var(--bg-soft); border: none; border-radius: 8px;
  color: var(--text-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.drawer-close:hover { background: var(--primary-soft); color: var(--primary); }

/* Tabs */
.drawer-tabs {
  display: flex;
  border-bottom: 1px solid var(--bg-soft);
  padding: 0 20px;
  background: var(--bg-main);
}
.tab {
  padding: 12px 16px;
  border: none; background: transparent;
  font-size: 13px; font-weight: 700; color: var(--text-light);
  cursor: pointer; border-bottom: 2px solid transparent;
  transition: all .15s; margin-bottom: -1px;
}
.tab.active { color: var(--primary); border-bottom-color: var(--primary); }
.tab:hover:not(.active) { color: var(--text-main); }

/* Body */
.drawer-body {
  flex: 1; overflow-y: auto;
  padding: 20px;
  display: flex; flex-direction: column; gap: 14px;
}

.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 12px; font-weight: 700; color: var(--text-muted); }
.field input, .field select {
  padding: 9px 12px;
  border: 1.5px solid var(--border-strong); border-radius: 9px;
  font-size: 13.5px; color: var(--text-main); background: var(--bg-main);
  transition: border-color .15s;
}
.field input:focus, .field select:focus {
  outline: none; border-color: var(--primary); background: #fff;
  box-shadow: 0 0 0 3px var(--input-focus-ring);
}
.field-row { display: flex; gap: 12px; }
.field-row .field { flex: 1; }

.toggle-field {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 12px; border: 1.5px solid var(--border-strong); border-radius: 9px;
  background: var(--bg-main); font-size: 13.5px; color: var(--text-main); font-weight: 600;
}
.toggle { position: relative; display: inline-block; width: 38px; height: 21px; }
.toggle input { display: none; }
.slider {
  position: absolute; inset: 0;
  background: var(--border-strong); border-radius: 21px; cursor: pointer; transition: .25s;
}
.slider:before {
  content: ''; position: absolute;
  width: 15px; height: 15px; left: 3px; bottom: 3px;
  background: #fff; border-radius: 50%; transition: .25s;
  box-shadow: 0 1px 3px rgba(0,0,0,.2);
}
.toggle input:checked + .slider { background: var(--primary); }
.toggle input:checked + .slider:before { transform: translateX(17px); }

.meta-block {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px; color: var(--text-light);
  padding: 8px 0; border-top: 1px solid var(--bg-soft); margin-top: 4px;
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
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: #fff; border: none; border-radius: 9px;
  font-size: 13.5px; font-weight: 700; cursor: pointer;
  box-shadow: 0 2px 8px var(--primary-glow);
  transition: opacity .15s;
}
.btn-primary:hover:not(:disabled) { opacity: .9; }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }

/* Compte tab */
.no-account-banner {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 16px; border: 1px solid var(--border-strong); border-radius: 12px;
  background: var(--bg-main); color: var(--text-muted);
}
.no-account-banner svg { flex-shrink: 0; margin-top: 2px; color: var(--text-light); }
.no-account-banner strong { font-size: 14px; color: var(--text-main); display: block; margin-bottom: 4px; }
.no-account-banner p { font-size: 12.5px; margin: 0; color: var(--text-muted); }

.account-section { display: flex; flex-direction: column; gap: 10px; }
.section-label {
  font-size: 10.5px; font-weight: 800; text-transform: uppercase;
  letter-spacing: .08em; color: var(--text-light); margin: 0;
}
.section-desc { font-size: 12.5px; color: var(--text-muted); margin: 0; line-height: 1.5; }

.divider { height: 1px; background: var(--bg-soft); margin: 4px 0; }

.btn-secondary {
  padding: 9px 16px; border: 1.5px solid var(--border-strong);
  border-radius: 9px; background: #fff; color: var(--text-muted);
  font-size: 13px; font-weight: 700; cursor: pointer; transition: all .15s;
  align-self: flex-start;
}
.btn-secondary:hover:not(:disabled) { background: var(--bg-soft); border-color: var(--border-strong); color: var(--text-main); }
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
  background: var(--bg-main); border: 1px solid var(--border-strong);
  border-radius: 8px; padding: 8px 10px;
  margin-top: 2px;
}
.link-text {
  font-size: 11px; color: var(--text-muted); font-family: monospace;
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  word-break: break-all;
}
.copy-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 10px;
  background: var(--primary); color: #fff;
  border: none; border-radius: 6px;
  font-size: 11.5px; font-weight: 700; cursor: pointer;
  white-space: nowrap; flex-shrink: 0;
  transition: opacity .15s;
}
.copy-btn:hover { opacity: .85; }

.account-meta {
  background: var(--bg-main); border: 1px solid var(--border-strong);
  border-radius: 10px; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 8px;
}
.meta-row { display: flex; align-items: center; justify-content: space-between; }
.meta-label { font-size: 12px; font-weight: 700; color: var(--text-light); }
.meta-val { font-size: 13px; color: var(--text-muted); }
.mono { font-family: monospace; }

/* ── Abonnement ── */
.sub-loading { text-align: center; color: var(--text-light); padding: 32px; font-size: 13px; }

/* Hero */
.sub-hero2 {
  border: 1.5px solid; border-radius: 14px;
  padding: 16px 18px;
  display: flex; flex-direction: column; gap: 10px;
}
.sub-hero2-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sub-status-badge {
  display: inline-flex; align-items: center;
  padding: 3px 10px; border-radius: 999px;
  font-size: 11px; font-weight: 800; color: #fff;
  letter-spacing: .04em; white-space: nowrap;
}
.sub-expiry { font-size: 13px; font-weight: 600; color: var(--text-muted); }
.expiry-ok      { color: #16a34a; }
.expiry-warn    { color: #d97706; }
.expiry-expired { color: #dc2626; font-weight: 700; }
.sub-date-line  { font-size: 12px; color: var(--text-muted); }

/* Quick actions */
.sub-quick-actions { display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
.qa-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 12px; border-radius: 8px; border: none;
  font-size: 12px; font-weight: 700; cursor: pointer; transition: opacity .15s;
  white-space: nowrap;
}
.qa-btn:hover { opacity: .85; }
.qa-btn--purple { background: var(--primary-soft); color: var(--primary); }
.qa-btn--gray   { background: var(--bg-soft); color: var(--text-muted); }
.qa-btn--green  { background: #f0fdf4; color: #16a34a; }

/* Trial picker */
.trial-wrap { position: relative; }
.trial-picker {
  position: absolute; top: calc(100% + 6px); left: 0; z-index: 10;
  background: #fff; border: 1.5px solid var(--border-strong); border-radius: 12px;
  padding: 14px; min-width: 200px;
  display: flex; flex-direction: column; gap: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,.1);
}
.trial-picker-label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: var(--text-light); }
.trial-days-row { display: flex; gap: 6px; }
.trial-day-btn {
  flex: 1; padding: 6px 0;
  border: 1.5px solid var(--border-strong); border-radius: 7px;
  background: var(--bg-main); color: var(--text-muted);
  font-size: 12px; font-weight: 700; cursor: pointer; transition: all .12s;
}
.trial-day-btn.active, .trial-day-btn:hover { background: var(--primary-soft); border-color: var(--primary-mid); color: var(--primary); }

/* Paiement card */
.pay-card {
  background: var(--bg-main); border: 1.5px solid var(--border-strong);
  border-radius: 14px; padding: 16px;
  display: flex; flex-direction: column; gap: 12px;
}
.pay-card-title {
  display: flex; align-items: center; gap: 7px;
  font-size: 13px; font-weight: 800; color: var(--text-main);
}
.pay-card-row { display: flex; gap: 10px; }
.pay-card-row .field { flex: 1; }

.btn-pay-submit {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 11px 18px;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: #fff; border: none; border-radius: 10px;
  font-size: 13px; font-weight: 700; cursor: pointer;
  box-shadow: 0 2px 8px var(--primary-glow);
  transition: opacity .15s;
}
.btn-pay-submit:hover:not(:disabled) { opacity: .9; }
.btn-pay-submit:disabled { opacity: .45; cursor: not-allowed; }

/* Accordéon config */
.config-accordion {
  border: 1px solid var(--border-strong); border-radius: 12px;
  overflow: hidden; background: #fff;
}
.config-accordion-trigger {
  width: 100%; display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: none; border: none;
  font-size: 13px; font-weight: 700; color: var(--text-muted);
  cursor: pointer; transition: background .12s;
}
.config-accordion-trigger:hover { background: var(--bg-main); }
.config-accordion-body {
  padding: 14px 16px 16px;
  display: flex; flex-direction: column; gap: 12px;
  border-top: 1px solid var(--bg-soft);
}
.config-accordion-body textarea {
  padding: 9px 12px; border: 1.5px solid var(--border-strong); border-radius: 9px;
  font-size: 13px; color: var(--text-main); resize: vertical; font-family: inherit;
  background: var(--bg-main); transition: border-color .15s;
}
.config-accordion-body textarea:focus { outline: none; border-color: var(--primary); background: #fff; }

/* Historique timeline */
.pay-history { display: flex; flex-direction: column; gap: 10px; }
.pay-history-header { display: flex; align-items: center; justify-content: space-between; }
.pay-total { font-size: 12px; font-weight: 700; color: var(--primary); }

.pay-timeline { display: flex; flex-direction: column; gap: 0; padding-left: 14px; border-left: 2px solid var(--border-strong); margin-left: 6px; }
.pay-tl-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 0; position: relative;
}
.pay-tl-dot {
  position: absolute; left: -19px; top: 50%; transform: translateY(-50%);
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--primary); border: 2px solid #fff;
  box-shadow: 0 0 0 2px var(--primary);
  flex-shrink: 0;
}
.pay-tl-body { flex: 1; min-width: 0; }
.pay-tl-amount { font-size: 14px; font-weight: 800; color: var(--text-main); }
.pay-tl-meta   { font-size: 11.5px; color: var(--text-light); margin-top: 1px; }

.pay-delete {
  width: 26px; height: 26px; border-radius: 6px;
  border: 1.5px solid #fca5a5; background: transparent;
  color: #dc2626; cursor: pointer; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  transition: all .12s;
}
.pay-delete:hover { background: #fee2e2; }
.pay-empty { text-align: center; font-size: 12.5px; color: var(--text-light); padding: 20px; font-style: italic; }

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
