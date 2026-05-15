import { supabase } from '@/lib/supabase'

export async function fetchSubscription(orgId) {
  const { data } = await supabase
    .from('organization_subscriptions')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle()
  return data
}

export async function upsertSubscription(orgId, payload) {
  const { data: existing } = await supabase
    .from('organization_subscriptions')
    .select('id')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (existing) {
    const { data, error } = await supabase
      .from('organization_subscriptions')
      .update(payload)
      .eq('organization_id', orgId)
      .select().single()
    if (error) throw error
    return data
  } else {
    const { data, error } = await supabase
      .from('organization_subscriptions')
      .insert({ organization_id: orgId, ...payload })
      .select().single()
    if (error) throw error
    return data
  }
}

export async function fetchPayments(orgId) {
  const { data } = await supabase
    .from('subscription_payments')
    .select('*')
    .eq('organization_id', orgId)
    .order('paid_at', { ascending: false })
  return data || []
}

export async function addPayment(orgId, payload) {
  const { data, error } = await supabase
    .from('subscription_payments')
    .insert({ organization_id: orgId, ...payload })
    .select().single()
  if (error) throw error
  return data
}

export async function deletePayment(id) {
  const { error } = await supabase.from('subscription_payments').delete().eq('id', id)
  if (error) throw error
}
