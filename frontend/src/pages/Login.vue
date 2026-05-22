<template>
  <div class="login-page">

    <!-- LEFT — Avantages -->
    <div class="left-panel">
      <div class="left-inner">

        <div class="brand">
          <div class="brand-dot"></div>
          <span class="brand-name">Glambook</span>
          <span class="brand-tag">Pro</span>
        </div>

        <h1>Gérez votre salon<br/>comme un pro.</h1>
        <p class="tagline">La plateforme tout-en-un pour les salons de coiffure et de beauté au Maroc.</p>

        <ul class="features">
          <li v-for="f in features" :key="f.title" class="feature">
            <div class="feature-icon">
              <component :is="'svg'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" v-html="f.icon"></component>
            </div>
            <div class="feature-text">
              <span class="feature-title">{{ f.title }}</span>
              <span class="feature-desc">{{ f.desc }}</span>
            </div>
          </li>
        </ul>

        <div class="left-footer">
          Glambook © 2026 · Maroc
        </div>

      </div>
    </div>

    <!-- RIGHT — Connexion -->
    <div class="right-panel">
      <div class="login-card">

        <div class="card-header">
          <div class="card-dot"></div>
          <span class="card-title">Espace salon</span>
        </div>

        <h2>Connexion</h2>
        <p class="sub">Accédez à votre tableau de bord.</p>

        <form @submit.prevent="handleLogin" class="form">
          <div class="field">
            <label>Email</label>
            <input v-model="email" type="email" placeholder="votre@salon.ma" required autocomplete="email" />
          </div>
          <div class="field">
            <label>Mot de passe</label>
            <input v-model="password" type="password" placeholder="••••••••" required autocomplete="current-password" />
          </div>
          <div v-if="error" class="error-box">{{ error }}</div>
          <button type="submit" class="btn-submit" :disabled="loading">
            <span v-if="loading">Connexion…</span>
            <span v-else>Se connecter →</span>
          </button>
        </form>

        <div class="access-link">
          Pas encore de compte ?
          <a href="mailto:med.benmansour@icloud.com?subject=Demande accès Glambook Pro">Demander un accès</a>
        </div>

        <div class="admin-trigger" @click="showAdminHint = !showAdminHint">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Admin
        </div>
        <div v-if="showAdminHint" class="admin-hint">Accès réservé à l'administrateur Glambook</div>

      </div>
    </div>

  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authService } from '../services/auth.service'

const router = useRouter()
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const showAdminHint = ref(false)

const features = [
  {
    title: 'Planning en temps réel',
    desc: 'Visualisez toute votre équipe et vos rendez-vous sur un seul écran.',
    icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'
  },
  {
    title: 'File d\'attente intelligente',
    desc: 'Gérez les sans-RDV et affectez vos collaborateurs en un clic.',
    icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
  },
  {
    title: 'Réservation en ligne',
    desc: 'Vos clients réservent 24h/24 depuis leur téléphone, sans application.',
    icon: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M12 6v6l4 2"/>'
  },
  {
    title: 'Rappels WhatsApp automatiques',
    desc: 'Réduisez les no-shows grâce aux confirmations automatiques.',
    icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'
  },
  {
    title: 'Statistiques & caisse',
    desc: 'Suivez vos revenus, vos prestations et vos performances en temps réel.',
    icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'
  },
]

async function handleLogin() {
  loading.value = true
  error.value = ''
  try {
    const user = await authService.login(email.value, password.value)
    router.push(user.role === 'superadmin' ? '/saas/organizations' : '/today')
  } catch {
    error.value = 'Identifiants invalides. Veuillez réessayer.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
* { box-sizing: border-box; margin: 0; padding: 0; }

.login-page {
  display: flex;
  min-height: 100vh;
  font-family: 'Sora', system-ui, sans-serif;
}

/* ── LEFT PANEL ── */
.left-panel {
  flex: 1;
  background: linear-gradient(150deg, #1C1A10 0%, #2C2510 45%, #A8810A 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 56px;
  position: relative;
  overflow: hidden;
}

.left-panel::before {
  content: '';
  position: absolute; inset: 0;
  background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
  pointer-events: none;
}

.left-inner {
  position: relative;
  max-width: 440px;
  width: 100%;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 500px;
}

/* Brand */
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 48px;
}

.brand-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: #D4AF37;
  box-shadow: 0 0 0 3px rgba(212,175,55,.3);
}

.brand-name {
  font-size: 20px;
  font-weight: 900;
  color: #fff;
  letter-spacing: -0.03em;
}

.brand-tag {
  font-size: 10px;
  font-weight: 800;
  color: #D4AF37;
  background: rgba(212,175,55,.15);
  border: 1px solid rgba(212,175,55,.3);
  border-radius: 6px;
  padding: 2px 7px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

h1 {
  font-size: clamp(28px, 3vw, 42px);
  font-weight: 900;
  color: #fff;
  letter-spacing: -0.03em;
  line-height: 1.15;
  margin-bottom: 16px;
}

.tagline {
  font-size: 15px;
  color: rgba(255,255,255,.6);
  line-height: 1.6;
  margin-bottom: 48px;
}

/* Features */
.features {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 24px;
  flex: 1;
}

.feature {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.feature-icon {
  width: 38px; height: 38px;
  border-radius: 10px;
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.12);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  color: #D4AF37;
}

.feature-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 2px;
}

.feature-title {
  font-size: 14px;
  font-weight: 700;
  color: rgba(255,255,255,.95);
}

.feature-desc {
  font-size: 12.5px;
  color: rgba(255,255,255,.5);
  line-height: 1.5;
}

.left-footer {
  margin-top: 48px;
  font-size: 12px;
  color: rgba(255,255,255,.25);
}

/* ── RIGHT PANEL ── */
.right-panel {
  width: 440px;
  flex-shrink: 0;
  background: var(--bg-main);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 48px;
}

.login-card {
  width: 100%;
  max-width: 360px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 28px;
}

.card-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-mid);
}

.card-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

h2 {
  font-size: 28px;
  font-weight: 900;
  color: var(--text-main);
  letter-spacing: -0.03em;
  margin-bottom: 6px;
}

.sub {
  font-size: 13.5px;
  color: var(--text-muted);
  margin-bottom: 32px;
}

/* Form */
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.field input {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 11px;
  padding: 12px 14px;
  font-size: 14.5px;
  color: var(--text-main);
  font-family: inherit;
  transition: border-color .15s, box-shadow .15s;
}

.field input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-glow);
}

.error-box {
  background: var(--red-soft);
  border: 1px solid var(--red);
  color: var(--red);
  border-radius: 9px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 500;
}

.btn-submit {
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 11px;
  padding: 13px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  margin-top: 4px;
  transition: background .15s, opacity .15s;
  letter-spacing: -0.01em;
}

.btn-submit:hover:not(:disabled) { background: #8A6A08; }
.btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }

.access-link {
  margin-top: 24px;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}

.access-link a {
  color: var(--primary);
  font-weight: 600;
  text-decoration: none;
  margin-left: 4px;
}

.access-link a:hover { text-decoration: underline; }

.admin-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--border-strong);
  cursor: pointer;
  margin-top: 24px;
  justify-content: flex-end;
  user-select: none;
  transition: color .15s;
}

.admin-trigger:hover { color: var(--text-muted); }

.admin-hint {
  margin-top: 6px;
  padding: 8px 12px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 11.5px;
  color: var(--text-muted);
  font-weight: 500;
  text-align: right;
}

/* Responsive */
@media (max-width: 860px) {
  .login-page { flex-direction: column; }
  .left-panel { padding: 48px 32px 40px; }
  .right-panel { width: 100%; padding: 40px 32px; }
  h1 { font-size: 28px; }
  .features { gap: 16px; }
}
</style>
