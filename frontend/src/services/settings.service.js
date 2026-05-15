import { supabase } from '@/lib/supabase'
import { getOrgId } from '@/composables/useOrgId'

export async function fetchSettings() {
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('organization_settings')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function saveSettings(payload) {
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('organization_settings')
    .upsert({ org_id: orgId, ...payload, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })
  if (error) throw error
}

export async function fetchClosures() {
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('salon_closures')
    .select('*')
    .eq('org_id', orgId)
    .order('date')
  if (error) throw error
  return data || []
}

export async function addClosure(startDate, endDate, label) {
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('salon_closures')
    .insert({ org_id: orgId, date: startDate, end_date: endDate || startDate, label: label || null })
  if (error) throw error
}

export async function deleteClosure(id) {
  const { error } = await supabase.from('salon_closures').delete().eq('id', id)
  if (error) throw error
}
