<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { authService } from '../../services/auth.service'
import { supabase } from '@/lib/supabase'

const router = useRouter()
const route = useRoute()

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])

const orgName   = ref('Glambook')
const orgLogo   = ref(null)
const logoKey   = ref(Date.now())
const isManager = computed(() => authService.isManager())

async function loadOrg() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const meta = user.user_metadata || {}
  const query = meta.role === 'manager'
    ? supabase.from('organizations').select('name, logo_url').eq('id', meta.org_id).single()
    : supabase.from('organizations').select('name, logo_url').eq('supabase_user_id', user.id).single()
  const { data: org } = await query
  if (org) {
    orgName.value  = org.name || 'Glambook'
    orgLogo.value  = org.logo_url || null
    logoKey.value  = Date.now()
  }
}

onMounted(() => {
  loadOrg()
  window.addEventListener('org-updated', loadOrg)
})

onUnmounted(() => {
  window.removeEventListener('org-updated', loadOrg)
})

function handleLogout() {
  authService.logout()
  router.push('/login')
  emit('close')
}

function isActive(path) {
  return route.path === path || route.path.startsWith(path + '/')
}
</script>

<template>
  <aside class="sidebar" :class="{ open }">
    <!-- Brand icon -->
    <div class="sidebar-logo">
      <div class="sidebar-brand-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="sidebar-nav">
      <router-link to="/today" class="sidebar-item" :class="{ active: isActive('/today') }" data-tooltip="Aujourd'hui" @click="emit('close')">
        <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
      </router-link>

      <router-link to="/admin/rdv" class="sidebar-item" :class="{ active: isActive('/admin/rdv') }" data-tooltip="Rendez-vous" @click="emit('close')">
        <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </router-link>

      <router-link to="/admin/clients" class="sidebar-item" :class="{ active: isActive('/admin/clients') }" data-tooltip="Clients" @click="emit('close')">
        <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      </router-link>

      <div class="sidebar-sep"></div>

      <router-link to="/admin/staff" class="sidebar-item" :class="{ active: isActive('/admin/staff') }" data-tooltip="Staff" @click="emit('close')">
        <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </router-link>

      <router-link to="/admin/services" class="sidebar-item" :class="{ active: isActive('/admin/services') }" data-tooltip="Catalogue" @click="emit('close')">
        <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M20 12h-2M6 12H4M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93M12 20v-2M12 6V4"/>
        </svg>
      </router-link>

      <router-link to="/admin/categories" class="sidebar-item" :class="{ active: isActive('/admin/categories') }" data-tooltip="Catégories" @click="emit('close')">
        <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/>
          <line x1="14" y1="5" x2="20" y2="5"/><line x1="14" y1="12" x2="20" y2="12"/><line x1="14" y1="19" x2="20" y2="19"/>
        </svg>
      </router-link>

      <template v-if="!isManager">
        <div class="sidebar-sep"></div>
        <router-link to="/admin/dashboard" class="sidebar-item" :class="{ active: isActive('/admin/dashboard') }" data-tooltip="Activité" @click="emit('close')">
          <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
        </router-link>

        <router-link to="/admin/stats" class="sidebar-item" :class="{ active: isActive('/admin/stats') }" data-tooltip="Statistiques" @click="emit('close')">
          <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
          </svg>
        </router-link>
      </template>
    </nav>

    <!-- Footer -->
    <div class="sidebar-footer">
      <router-link v-if="!isManager" to="/admin/settings" class="sidebar-item" :class="{ active: isActive('/admin/settings') }" data-tooltip="Paramètres" @click="emit('close')">
        <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </router-link>
      <button class="sidebar-item sidebar-logout" data-tooltip="Déconnexion" @click="handleLogout">
        <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>
      <button class="sidebar-avatar-btn" :data-tooltip="orgName" @click="router.push('/admin/account')">
        {{ orgName.charAt(0).toUpperCase() }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-brand-icon {
  width: 40px; height: 40px;
  background: var(--primary);
  border-radius: var(--radius);
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  box-shadow: 0 2px 8px rgba(124,58,237,.35);
}
</style>
