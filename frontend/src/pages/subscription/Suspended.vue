<!--
-- Run in Supabase SQL editor:
-- CREATE TABLE saas_settings (
--   id int PRIMARY KEY DEFAULT 1,
--   whatsapp_number text,
--   contact_email text,
--   updated_at timestamptz DEFAULT now()
-- );
-- INSERT INTO saas_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
-- ALTER TABLE saas_settings ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "authenticated read" ON saas_settings FOR SELECT USING (true);
-- CREATE POLICY "superadmin write" ON saas_settings FOR ALL USING (auth.jwt()->>'role' = 'superadmin');
-->
<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { fetchSaasSettings } from '@/services/saasConfig.service'
import { useSubscription } from '@/composables/useSubscription'

const router = useRouter()
const settings = ref({ whatsapp_number: '', contact_email: '' })

onMounted(async () => {
  settings.value = await fetchSaasSettings()
})

async function logout() {
  const { clearSubscriptionCache } = useSubscription()
  clearSubscriptionCache()
  await supabase.auth.signOut()
  router.push('/login')
}

function openWhatsApp() {
  const num = settings.value.whatsapp_number.replace(/\s+/g, '').replace(/^\+/, '')
  window.open(`https://wa.me/${num}`, '_blank')
}

function openEmail() {
  window.location.href = `mailto:${settings.value.contact_email}`
}

const hasContact = () => settings.value.whatsapp_number || settings.value.contact_email
</script>

<template>
  <div class="suspended-layout">
    <!-- Header -->
    <header class="suspended-topbar">
      <div class="brand">
        <div class="brand-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        </div>
        <div class="brand-text">
          <span class="brand-name">Glambook</span>
          <span class="brand-tag">Plateforme</span>
        </div>
      </div>
      <button class="topbar-logout" @click="logout">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Déconnexion
      </button>
    </header>

    <!-- Centered content -->
    <main class="suspended-main">
      <div class="suspended-card">
        <!-- Lock icon -->
        <div class="lock-icon-wrap">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>

        <h1 class="suspended-title">Abonnement suspendu</h1>
        <p class="suspended-subtitle">
          Votre accès a été suspendu. Veuillez régulariser votre situation pour continuer à utiliser la plateforme.
        </p>

        <!-- Contact buttons -->
        <div v-if="settings.whatsapp_number || settings.contact_email" class="contact-actions">
          <button
            v-if="settings.whatsapp_number"
            class="contact-btn whatsapp"
            @click="openWhatsApp"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
            </svg>
            Contacter sur WhatsApp
          </button>

          <button
            v-if="settings.contact_email"
            class="contact-btn email"
            @click="openEmail"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            Envoyer un email
          </button>
        </div>

        <p v-else class="no-contact">Contactez votre administrateur pour régulariser votre abonnement.</p>

        <!-- Divider -->
        <div class="divider"></div>

        <!-- Logout -->
        <button class="logout-btn" @click="logout">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Se déconnecter
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.suspended-layout {
  min-height: 100vh;
  background: var(--bg-soft);
  display: flex;
  flex-direction: column;
}

/* Topbar */
.suspended-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  height: 64px;
  background: var(--text-main);
  border-bottom: 1px solid var(--bg-soft);
  flex-shrink: 0;
}

.brand { display: flex; align-items: center; gap: 12px; }
.brand-icon {
  width: 36px; height: 36px;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
}
.brand-text { display: flex; flex-direction: column; }
.brand-name { font-size: 15px; font-weight: 800; color: #fff; letter-spacing: -.3px; }
.brand-tag  { font-size: 10px; font-weight: 600; color: var(--primary); text-transform: uppercase; letter-spacing: .08em; }

.topbar-logout {
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
.topbar-logout:hover { background: var(--primary-soft); color: #fff; border-color: var(--primary-mid); }

/* Main */
.suspended-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
}

/* Card */
.suspended-card {
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0,0,0,.1), 0 2px 8px rgba(0,0,0,.06);
  padding: 48px 40px;
  max-width: 460px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
}

.lock-icon-wrap {
  width: 72px; height: 72px;
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  border-radius: 20px;
  display: flex; align-items: center; justify-content: center;
  color: #d97706;
  margin-bottom: 4px;
}

.suspended-title {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-main);
  margin: 0;
}

.suspended-subtitle {
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1.6;
  margin: 0;
  max-width: 360px;
}

/* Contact actions */
.contact-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  margin-top: 8px;
}

.contact-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%;
  padding: 12px 20px;
  border: none;
  border-radius: 10px;
  font-size: 14px; font-weight: 700;
  cursor: pointer;
  transition: opacity .15s;
}
.contact-btn:hover { opacity: .88; }

.contact-btn.whatsapp {
  background: #22c55e;
  color: #fff;
}

.contact-btn.email {
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: #fff;
}

.no-contact {
  font-size: 13.5px;
  color: var(--text-light);
  font-style: italic;
  margin: 0;
}

.divider {
  width: 100%;
  height: 1px;
  background: var(--bg-soft);
  margin: 4px 0;
}

.logout-btn {
  display: flex; align-items: center; gap: 7px;
  padding: 9px 18px;
  background: transparent;
  border: 1.5px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text-muted);
  font-size: 13px; font-weight: 600;
  cursor: pointer;
  transition: all .15s;
}
.logout-btn:hover { background: var(--bg-main); color: var(--text-main); border-color: var(--border-strong); }

@media (max-width: 480px) {
  .suspended-topbar { padding: 0 16px; }
  .suspended-card { padding: 32px 20px; }
  .brand-tag { display: none; }
}
</style>
