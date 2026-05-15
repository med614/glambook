import { supabase } from '@/lib/supabase'
import { getOrgId } from '@/composables/useOrgId'
import { cleanPhone } from '@/utils/phone'

export async function findClientByPhone(phone) {
  if (!phone) return null
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('phone', cleanPhone(phone))
    .maybeSingle()
  if (error) console.error('findClientByPhone error:', error)
  return data
}

export async function fetchAllClients() {
  const [{ data, error }, { data: badAppts }] = await Promise.all([
    supabase.from('clients').select('*').order('name', { ascending: true }),
    supabase.from('appointments').select('client_id, status').in('status', ['cancelled', 'no_show'])
  ])
  if (error) throw error

  const counts = { cancelled: {}, no_show: {} }
  for (const a of (badAppts || [])) {
    if (!a.client_id) continue
    if (a.status === 'cancelled') counts.cancelled[a.client_id] = (counts.cancelled[a.client_id] || 0) + 1
    if (a.status === 'no_show')   counts.no_show[a.client_id]   = (counts.no_show[a.client_id]   || 0) + 1
  }

  return data.map(c => {
    const noShowCount    = counts.no_show[c.id]   || 0
    const cancelledCount = counts.cancelled[c.id] || 0
    const totalBad = noShowCount + cancelledCount
    return {
      ...c,
      no_show_count:    noShowCount,
      cancelled_count:  cancelledCount,
      is_flagged: totalBad >= 2 && totalBad > (c.flag_dismissed_count || 0)
    }
  })
}

export async function clearClientFlag(clientId, currentBadCount) {
  const { error } = await supabase
    .from('clients')
    .update({ flag_dismissed_count: currentBadCount })
    .eq('id', clientId)
  if (error) throw error
}

export async function createClient(payload) {
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('clients')
    .insert({
      organization_id: orgId,
      name: payload.name,
      last_name: payload.last_name || null,
      phone: cleanPhone(payload.phone)
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateClient(clientId, payload) {
  if (!clientId) throw new Error('ID du client manquant')
  const { data, error } = await supabase
    .from('clients')
    .update({
      name: payload.name,
      last_name: payload.last_name || null,
      phone: cleanPhone(payload.phone)
    })
    .eq('id', clientId)
    .select()
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Aucun client trouvé pour la mise à jour')
  return true
}

export async function deleteClient(clientId) {
  if (!clientId) throw new Error('ID du client manquant')
  const { error } = await supabase.from('clients').delete().eq('id', clientId)
  if (error) throw error
  return true
}

export async function getOrCreateClient(payload) {
  const phone = cleanPhone(payload.phone)
  const { data: existing, error } = await supabase
    .from('clients')
    .select('*')
    .eq('phone', phone)
    .maybeSingle()
  if (error) throw error
  if (existing) return existing
  return createClient(payload)
}
