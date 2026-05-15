import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'

// Module-level cache keyed by orgId, TTL 5 min
const cache = {}
const CACHE_TTL = 5 * 60 * 1000

const subscription = ref(null)
const orgActive    = ref(true)

const isBlocked = computed(() =>
  orgActive.value === false ||
  ['suspended', 'cancelled'].includes(subscription.value?.status)
)
const isTrial = computed(() => subscription.value?.status === 'trial')
const daysLeft = computed(() => {
  if (!subscription.value?.paid_until) return null
  return Math.ceil((new Date(subscription.value.paid_until) - new Date()) / 86400000)
})

async function loadSubscription(orgId) {
  if (!orgId) return null

  const hit = cache[orgId]
  if (hit && Date.now() - hit.time < CACHE_TTL) {
    subscription.value = hit.sub
    orgActive.value    = hit.active
    return hit.sub
  }

  const [{ data: org }, { data: sub }] = await Promise.all([
    supabase.from('organizations').select('is_active').eq('id', orgId).maybeSingle(),
    supabase.from('organization_subscriptions').select('status, paid_until, monthly_price').eq('organization_id', orgId).maybeSingle()
  ])

  cache[orgId] = { sub, active: org?.is_active ?? true, time: Date.now() }
  subscription.value = sub
  orgActive.value    = org?.is_active ?? true
  return sub
}

function clearSubscriptionCache(orgId) {
  if (orgId) {
    delete cache[orgId]
  } else {
    Object.keys(cache).forEach(k => delete cache[k])
  }
  subscription.value = null
  orgActive.value    = true
}

export function useSubscription() {
  return { subscription, orgActive, isBlocked, isTrial, daysLeft, loadSubscription, clearSubscriptionCache }
}
