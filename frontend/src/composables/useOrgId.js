import { supabase } from '@/lib/supabase'

let _cachedOrgId = null

supabase.auth.onAuthStateChange((_event, session) => {
  _cachedOrgId = session?.user?.user_metadata?.org_id || null
})

supabase.auth.getSession().then(({ data }) => {
  _cachedOrgId = data?.session?.user?.user_metadata?.org_id || null
})

export async function getOrgId() {
  if (_cachedOrgId) return _cachedOrgId
  const { data } = await supabase.auth.getSession()
  _cachedOrgId = data?.session?.user?.user_metadata?.org_id || null
  return _cachedOrgId
}

export function getOrgIdSync() {
  return _cachedOrgId
}
