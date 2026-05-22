import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/lib/supabase'
import Today from '../pages/Today.vue'
import Login from '../pages/Login.vue'
import Organizations from '../pages/saas/Organizations.vue'
import Staff from '@/pages/admin/Staff.vue'
import Rdv from '@/pages/admin/Rdv.vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { public: true }
  },
  {
    path: '/auth/set-password',
    name: 'SetPassword',
    component: () => import('@/pages/auth/SetPassword.vue'),
    meta: { public: true }
  },
  {
    path: '/',
    redirect: '/today'
  },
  {
    path: '/admin/rdv',
    name: 'AdminRdv',
    component: Rdv
  },
  {
    path: '/today',
    name: 'Today',
    component: Today
  },
  {
    path: '/saas/organizations',
    name: 'Organizations',
    component: Organizations,
    meta: { requiresSuperAdmin: true }
  },
  {
    path: '/saas/account',
    name: 'SaasAccount',
    component: () => import('@/pages/saas/SaasAccount.vue'),
    meta: { requiresSuperAdmin: true }
  },
  {
    path: '/admin/services',
    name: 'AdminServices',
    component: () => import('@/pages/admin/Services.vue')
  },
  {
    path: '/admin/clients',
    name: 'AdminClients',
    component: () => import('@/pages/admin/Clients.vue')
  },
  {
    path: '/admin/staff',
    name: 'AdminStaff',
    component: Staff
  },
  {
    path: '/admin/dashboard',
    name: 'AdminDashboard',
    component: () => import('@/pages/admin/Dashboard.vue'),
    meta: { requiresAdmin: true }
  },
  {
    path: '/admin/categories',
    name: 'AdminCategories',
    component: () => import('@/pages/admin/Categories.vue')
  },
  {
    path: '/admin/account',
    name: 'AdminAccount',
    component: () => import('@/pages/admin/Account.vue')
  },
  {
    path: '/admin/stats',
    name: 'AdminStats',
    component: () => import('@/pages/admin/Stats.vue'),
    meta: { requiresAdmin: true }
  },
  {
    path: '/admin/settings',
    name: 'AdminSettings',
    component: () => import('@/pages/admin/Settings.vue'),
    meta: { requiresAdmin: true }
  },
  {
    path: '/booking',
    redirect: '/',
  },
  {
    path: '/booking/:orgId',
    name: 'BookingCalendar',
    component: () => import('@/pages/booking/BookingCalendar.vue'),
    meta: { public: true }
  },
  {
    path: '/subscription/suspended',
    name: 'Suspended',
    component: () => import('@/pages/subscription/Suspended.vue'),
    meta: { public: false, skipSubCheck: true }
  },
  {
    path: '/salon/freestyle',
    name: 'FreestyleLanding',
    component: () => import('@/pages/landings/FreestyleLanding.vue'),
    meta: { public: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to, from, next) => {
  const { data } = await supabase.auth.getSession()
  const session = data?.session
  const isAuthenticated = !!session
  const role = session?.user?.user_metadata?.role || 'admin'
  const isSuperAdmin = role === 'superadmin'

  if (!to.meta.public && !isAuthenticated) {
    return next('/login')
  }

  if (to.name === 'Login' && isAuthenticated) {
    return next(isSuperAdmin ? '/saas/organizations' : '/today')
  }

  if (to.meta.requiresSuperAdmin && !isSuperAdmin) {
    return next('/today')
  }

  // Bloquer les managers sur les routes admin-only
  const isManager = role === 'manager'
  if (to.meta.requiresAdmin && isManager) {
    return next('/today')
  }

  // Subscription / org enforcement: block suspended orgs
  if (!to.meta.public && !to.meta.skipSubCheck && isAuthenticated && !isSuperAdmin) {
    const orgId = session.user.user_metadata?.org_id
    if (orgId) {
      // Check org is_active AND subscription status in one query
      const [{ data: org }, { data: sub }] = await Promise.all([
        supabase.from('organizations').select('is_active').eq('id', orgId).maybeSingle(),
        supabase.from('organization_subscriptions').select('status').eq('organization_id', orgId).maybeSingle()
      ])

      const orgInactive = org && org.is_active === false
      const subBlocked  = sub && ['suspended', 'cancelled'].includes(sub.status)

      if (orgInactive || subBlocked) {
        return next('/subscription/suspended')
      }
    }
  }

  next()
})

export default router
