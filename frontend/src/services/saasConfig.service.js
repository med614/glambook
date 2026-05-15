import { supabase } from '@/lib/supabase'

export async function fetchSaasSettings() {
  const { data } = await supabase.from('saas_settings').select('*').eq('id', 1).maybeSingle()
  return data || { whatsapp_number: '', contact_email: '' }
}

export async function updateSaasSettings(payload) {
  const { data: existing } = await supabase.from('saas_settings').select('id').eq('id', 1).maybeSingle()
  if (existing) {
    const { data, error } = await supabase.from('saas_settings').update(payload).eq('id', 1).select().single()
    if (error) throw error
    return data
  } else {
    const { data, error } = await supabase.from('saas_settings').insert({ id: 1, ...payload }).select().single()
    if (error) throw error
    return data
  }
}
