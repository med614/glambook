<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'vue-router'

const router = useRouter()
const password = ref('')
const confirm = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)
const mode = ref('') // 'recovery' | 'invite' | ''
const ready = ref(false)

onMounted(async () => {
  // Supabase puts token in hash — the client auto-exchanges it
  const { data } = await supabase.auth.getSession()
  if (data?.session) {
    const type = new URLSearchParams(window.location.hash.slice(1)).get('type')
    mode.value = type || 'recovery'
    ready.value = true
  } else {
    error.value = 'Lien invalide ou expiré. Contactez votre administrateur.'
    ready.value = true
  }
})

async function handleSubmit() {
  if (password.value.length < 8) {
    error.value = 'Le mot de passe doit contenir au moins 8 caractères.'
    return
  }
  if (password.value !== confirm.value) {
    error.value = 'Les mots de passe ne correspondent pas.'
    return
  }
  loading.value = true
  error.value = ''
  const { error: err } = await supabase.auth.updateUser({ password: password.value })
  loading.value = false
  if (err) {
    error.value = err.message
  } else {
    success.value = true
    setTimeout(() => router.push('/today'), 2500)
  }
}
</script>

<template>
  <div class="reset-page">
    <div class="reset-card">
      <div class="reset-brand">
        <div class="brand-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        </div>
        <span class="brand-name">Glambook</span>
      </div>

      <div v-if="!ready" class="state-center">
        <div class="spinner"></div>
        <p>Vérification du lien…</p>
      </div>

      <template v-else-if="success">
        <div class="state-center success">
          <div class="success-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h2>Mot de passe défini !</h2>
          <p>Vous allez être redirigé automatiquement…</p>
        </div>
      </template>

      <template v-else>
        <div class="reset-header">
          <h1>{{ mode === 'invite' ? 'Bienvenue !' : 'Nouveau mot de passe' }}</h1>
          <p>{{ mode === 'invite' ? 'Définissez votre mot de passe pour activer votre compte.' : 'Choisissez un nouveau mot de passe sécurisé.' }}</p>
        </div>

        <div v-if="error" class="alert danger">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {{ error }}
        </div>

        <form @submit.prevent="handleSubmit" class="reset-form">
          <div class="field">
            <label>Nouveau mot de passe</label>
            <input v-model="password" type="password" placeholder="Min. 8 caractères" autocomplete="new-password" />
          </div>
          <div class="field">
            <label>Confirmer le mot de passe</label>
            <input v-model="confirm" type="password" placeholder="Répéter le mot de passe" autocomplete="new-password" />
          </div>
          <button type="submit" class="btn-submit" :disabled="loading || !password || !confirm">
            {{ loading ? 'Enregistrement…' : 'Définir le mot de passe' }}
          </button>
        </form>
      </template>
    </div>
  </div>
</template>

<style scoped>
.reset-page {
  min-height: 100vh;
  background: var(--bg-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.reset-card {
  background: #fff;
  border-radius: 16px;
  padding: 36px 32px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 8px 40px rgba(0,0,0,.1);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.reset-brand {
  display: flex; align-items: center; gap: 10px;
  justify-content: center;
}
.brand-icon {
  width: 38px; height: 38px;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
}
.brand-name { font-size: 18px; font-weight: 800; color: var(--text-main); }

.reset-header { text-align: center; }
.reset-header h1 { font-size: 20px; font-weight: 800; color: var(--text-main); margin: 0 0 6px; }
.reset-header p  { font-size: 13.5px; color: var(--text-muted); margin: 0; }

.state-center {
  display: flex; flex-direction: column;
  align-items: center; gap: 12px;
  padding: 20px 0;
  color: var(--text-muted); font-size: 14px; text-align: center;
}
.state-center h2 { font-size: 18px; font-weight: 800; color: var(--text-main); margin: 0; }
.state-center p { margin: 0; }
.state-center.success { color: #16a34a; }

.success-icon {
  width: 56px; height: 56px;
  background: #f0fdf4; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #16a34a;
}

.spinner {
  width: 28px; height: 28px;
  border: 3px solid var(--border-strong);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.alert.danger {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  background: #fef2f2; border: 1px solid #fca5a5;
  border-radius: 8px; font-size: 13px; color: #dc2626; font-weight: 600;
}

.reset-form { display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 12.5px; font-weight: 700; color: var(--text-muted); }
.field input {
  padding: 10px 13px;
  border: 1.5px solid var(--border-strong); border-radius: 9px;
  font-size: 14px; color: var(--text-main); background: var(--bg-main);
  transition: border-color .15s;
}
.field input:focus {
  outline: none; border-color: var(--primary); background: #fff;
  box-shadow: 0 0 0 3px var(--input-focus-ring);
}

.btn-submit {
  padding: 11px;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: #fff; border: none; border-radius: 10px;
  font-size: 14px; font-weight: 700; cursor: pointer;
  box-shadow: 0 2px 10px var(--primary-glow);
  transition: opacity .15s;
}
.btn-submit:hover:not(:disabled) { opacity: .9; }
.btn-submit:disabled { opacity: .5; cursor: not-allowed; }
</style>
