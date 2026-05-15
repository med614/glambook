<template>
  <div class="app-shell">
    <!-- Sidebar (salon routes only) -->
    <template v-if="!isPublicRoute && !isSaasRoute">
      <Sidebar :open="sidebarOpen" @close="sidebarOpen = false" />
      <div class="mobile-overlay" :class="{ open: sidebarOpen }" @click="sidebarOpen = false" />
    </template>

    <!-- Main content -->
    <div :class="(isPublicRoute || isSaasRoute) ? 'full-width' : 'main-content'">
      <!-- Mobile topbar -->
      <div v-if="!isPublicRoute && !isSaasRoute" class="mobile-topbar">
        <button class="mobile-menu-btn" @click="sidebarOpen = !sidebarOpen" aria-label="Menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <span style="color:#E2E8F0;font-weight:700;font-size:15px;">Glambook</span>
        <div style="width:36px;"></div>
      </div>

      <!-- Trial banner -->
      <div
        v-if="!isPublicRoute && !isSaasRoute && isTrial"
        class="trial-banner"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>
          Vous êtes en période d'essai
          <template v-if="daysLeft !== null">
            &mdash;
            <strong>
              {{ daysLeft > 0 ? `${daysLeft} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''}` : 'Période expirée' }}
            </strong>
          </template>
        </span>
      </div>

      <router-view />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import Sidebar from './components/layout/Sidebar.vue'
import { useSubscription } from '@/composables/useSubscription'

const route = useRoute()
const router = useRouter()
const sidebarOpen = ref(false)
const isPublicRoute = computed(() => route.meta.public === true)
const isSaasRoute   = computed(() => route.path.startsWith('/saas'))

const { isTrial, daysLeft, loadSubscription } = useSubscription()

// Intercept Supabase auth events (password recovery / invite)
// so the app handles them even if the redirect URL lands on "/"
onMounted(async () => {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
      const hash = window.location.hash
      if (hash.includes('type=recovery') || hash.includes('type=invite')) {
        router.replace('/auth/set-password')
      }
    }
  })

  // Load subscription for trial banner (admin users only, not superadmin)
  const { data } = await supabase.auth.getSession()
  const session = data?.session
  if (session) {
    const role = session.user?.user_metadata?.role || 'admin'
    const isSuperAdmin = role === 'superadmin'
    if (!isSuperAdmin) {
      const orgId = session.user.user_metadata?.org_id
      if (orgId) {
        await loadSubscription(orgId)
      }
    }
  }
})
</script>

<style>
@import './assets/css/admin.css';
@import './assets/lux-modal.css';

.full-width {
  width: 100%;
  min-height: 100vh;
}

.trial-banner {
  background: #fffbeb;
  border-bottom: 2px solid #fbbf24;
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  color: #92400e;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
