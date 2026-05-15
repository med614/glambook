<template>
  <div class="login-page">
    <!-- Left panel -->
    <div class="login-panel-left">
      <div class="login-brand">
        <div class="login-brand-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        </div>
        <div>
          <div class="login-brand-name">Glambook</div>
          <div class="login-brand-tagline">Réservez dans les meilleurs salons</div>
        </div>
      </div>

      <div class="login-hero">
        <h1>Bienvenue<br/>sur votre espace</h1>
        <p>Gérez vos rendez-vous, votre équipe et vos clients depuis une seule plateforme.</p>
      </div>

      <div class="login-features">
        <div class="login-feature">
          <div class="login-feature-dot"></div>
          <span>Suivi des rendez-vous en temps réel</span>
        </div>
        <div class="login-feature">
          <div class="login-feature-dot"></div>
          <span>Gestion des collaborateurs et absences</span>
        </div>
        <div class="login-feature">
          <div class="login-feature-dot"></div>
          <span>File d'attente et walk-ins simplifiés</span>
        </div>
      </div>
    </div>

    <!-- Right panel — Form -->
    <div class="login-panel-right">
      <div class="login-form-card">
        <div class="login-form-header">
          <h2>Connexion</h2>
          <p>Accédez à votre tableau de bord</p>
        </div>

        <form @submit.prevent="handleLogin" class="login-form">
          <div class="login-field">
            <label for="email">Adresse email</label>
            <input
              id="email"
              v-model="email"
              type="email"
              placeholder="votre@email.com"
              required
              autocomplete="email"
            />
          </div>

          <div class="login-field">
            <label for="password">Mot de passe</label>
            <input
              id="password"
              v-model="password"
              type="password"
              placeholder="••••••••"
              required
              autocomplete="current-password"
            />
          </div>

          <div v-if="error" class="login-error">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {{ error }}
          </div>

          <button type="submit" class="login-btn" :disabled="loading">
            <span v-if="loading">Connexion en cours…</span>
            <span v-else>Se connecter</span>
          </button>
        </form>

        <!-- Séparateur -->
        <div class="login-divider">
          <span>ou</span>
        </div>

        <!-- Bouton prise de RDV -->
        <router-link to="/booking" class="booking-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Prendre un rendez-vous en ligne
        </router-link>

        <div class="login-footer-row">
          <p class="login-footer-note">© 2026 Glambook</p>
          <span class="admin-hint" @click="showAdminHint = !showAdminHint">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Admin
          </span>
        </div>
        <div v-if="showAdminHint" class="admin-hint-box">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Accès réservé à l'administrateur de la plateforme Glambook
        </div>
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
.login-page {
  display: flex;
  min-height: 100vh;
  background: #F1F5F9;
}

/* ---- Left panel ---- */
.login-panel-left {
  flex: 1;
  background: #0F172A;
  padding: 48px 56px;
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;
  overflow: hidden;
}

.login-panel-left::before {
  content: '';
  position: absolute;
  top: -120px;
  right: -120px;
  width: 400px;
  height: 400px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(8,145,178,0.15) 0%, transparent 70%);
  pointer-events: none;
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: auto;
}

.login-brand-icon {
  width: 48px;
  height: 48px;
  background: rgba(8,145,178,0.2);
  border: 1px solid rgba(8,145,178,0.3);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #38BDF8;
}

.login-brand-name {
  font-size: 18px;
  font-weight: 800;
  color: #F1F5F9;
  letter-spacing: -0.02em;
}

.login-brand-tagline {
  font-size: 12px;
  color: #475569;
  margin-top: 2px;
}

.login-hero {
  margin-top: 80px;
  margin-bottom: 40px;
}

.login-hero h1 {
  font-size: 38px;
  font-weight: 800;
  color: #F8FAFC;
  line-height: 1.15;
  letter-spacing: -0.03em;
  margin-bottom: 16px;
}

.login-hero p {
  font-size: 15px;
  color: #64748B;
  line-height: 1.6;
  max-width: 340px;
}

.login-features {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 48px;
}

.login-feature {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13.5px;
  color: #94A3B8;
}

.login-feature-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #0891B2;
  flex-shrink: 0;
}

/* ---- Right panel ---- */
.login-panel-right {
  width: 480px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 40px;
}

.login-form-card {
  width: 100%;
  max-width: 380px;
}

.login-form-header {
  margin-bottom: 32px;
}

.login-form-header h2 {
  font-size: 26px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: -0.02em;
  margin-bottom: 6px;
}

.login-form-header p {
  font-size: 14px;
  color: #64748B;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.login-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.login-field label {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.login-field input {
  background: #fff;
  border: 1.5px solid #E2E8F0;
  border-radius: 10px;
  padding: 11px 14px;
  font-size: 14.5px;
  color: #0F172A;
  transition: all 0.15s;
  width: 100%;
  font-family: inherit;
}

.login-field input:focus {
  outline: none;
  border-color: #0891B2;
  box-shadow: 0 0 0 3px rgba(8,145,178,0.12);
}

.login-error {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #FEF2F2;
  border: 1px solid #FECACA;
  color: #DC2626;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 500;
}

.login-btn {
  background: #0891B2;
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 13px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  margin-top: 4px;
}

.login-btn:hover:not(:disabled) {
  background: #0E7490;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(8,145,178,0.3);
}

.login-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.login-footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 28px;
}

.login-footer-note {
  font-size: 12px;
  color: #94A3B8;
}

.admin-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #cbd5e1;
  cursor: pointer;
  user-select: none;
  transition: color .15s;
}
.admin-hint:hover { color: #94a3b8; }

.admin-hint-box {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 8px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 11.5px;
  color: #64748b;
  font-weight: 500;
}

/* Divider */
.login-divider {
  display: flex; align-items: center; gap: 12px;
  margin: 20px 0 16px;
  color: #cbd5e1; font-size: 12px;
}
.login-divider::before, .login-divider::after {
  content: ''; flex: 1; height: 1px; background: #e2e8f0;
}

/* Booking button */
.booking-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; padding: 11px 16px;
  background: #f8fafc; border: 1.5px solid #e2e8f0;
  border-radius: 10px; text-decoration: none;
  font-size: 14px; font-weight: 600; color: #475569;
  transition: border-color .15s, color .15s, background .15s;
}
.booking-btn:hover {
  border-color: #6366f1; color: #6366f1; background: #f5f3ff;
}

/* Responsive */
@media (max-width: 900px) {
  .login-panel-left { display: none; }
  .login-panel-right { width: 100%; padding: 40px 24px; }
}
</style>
