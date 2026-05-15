import { reactive } from 'vue'
import { supabase } from '@/lib/supabase'

const state = reactive({
  isAuthenticated: false,
  user: null,
  session: null
})

// Restore session from Supabase on init — main.js already refreshed the token
supabase.auth.getSession().then(({ data }) => {
  if (data?.session) {
    state.session = data.session
    state.isAuthenticated = true
    state.user = buildUser(data.session)
  }
})

supabase.auth.onAuthStateChange((_event, session) => {
  state.session = session
  state.isAuthenticated = !!session
  state.user = session ? buildUser(session) : null
})

function buildUser(session) {
  const meta = session.user?.user_metadata || {}
  const role = meta.role || 'admin'
  return {
    id: session.user.id,
    email: session.user.email,
    name: meta.admin_name || meta.name || session.user.email,
    role
  }
}

export const authService = {
  async login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    // Refresh to get latest user_metadata (org_id, role)
    const { data: refreshed } = await supabase.auth.refreshSession()
    const session = refreshed?.session || data.session
    state.session = session
    state.isAuthenticated = true
    state.user = buildUser(session)
    return state.user
  },

  async logout() {
    await supabase.auth.signOut()
    state.isAuthenticated = false
    state.user = null
    state.session = null
  },

  isAuthenticated() {
    return state.isAuthenticated
  },

  getUser() {
    return state.user
  },

  isSuperAdmin() {
    return state.user?.role === 'superadmin'
  },

  isAdmin() {
    return state.user?.role === 'admin' || state.user?.role === 'superadmin'
  },

  isManager() {
    return state.user?.role === 'manager'
  },

  canAccess(feature) {
    const role = state.user?.role
    if (role === 'superadmin' || role === 'admin') return true
    // manager : pas accès aux stats, activité, paramètres
    if (role === 'manager') {
      return !['stats', 'dashboard', 'settings'].includes(feature)
    }
    return false
  }
}
