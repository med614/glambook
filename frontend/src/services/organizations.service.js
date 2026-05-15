import { supabase } from '@/lib/supabase'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

async function saasHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }
}

export async function fetchOrganizations() {
  // Try with subscription join; fall back to plain select if table doesn't exist yet
  const { data, error } = await supabase
    .from('organizations')
    .select('*, subscription:organization_subscriptions(status, paid_until)')
    .order('created_at', { ascending: false })

  if (error) {
    // Table absente → requête sans jointure
    const { data: plain, error: e2 } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false })
    if (e2) throw e2
    return (plain || []).map(o => ({ ...o, subscription: null }))
  }

  return (data || []).map(o => ({
    ...o,
    subscription: Array.isArray(o.subscription) ? o.subscription[0] ?? null : o.subscription
  }))
}

export async function createOrganization(payload) {
  const { data, error } = await supabase
    .from('organizations')
    .insert([{
      name: payload.name,
      type: payload.type,
      phone: payload.phone,
      whatsapp_automation_number: payload.whatsapp_automation_number,
      email: payload.email || null,
      admin_name: payload.admin_name || null
    }])
    .select()
    .single()
  if (error) throw error

  // If email provided, create Supabase Auth account + send invite
  if (payload.email) {
    const res = await fetch(`${API_BASE}/saas/users`, {
      method: 'POST',
      headers: await saasHeaders(),
      body: JSON.stringify({ org_id: data.id, email: payload.email, admin_name: payload.admin_name })
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to create user account')
    }
  }

  return data
}

export async function updateOrganization(id, payload) {
  const { data, error } = await supabase
    .from('organizations')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function toggleOrganization(id, isActive) {
  const { error } = await supabase
    .from('organizations')
    .update({ is_active: isActive })
    .eq('id', id)
  if (error) throw error
}

export async function sendResetPassword(userId) {
  const res = await fetch(`${API_BASE}/saas/users/${userId}/reset-password`, {
    method: 'POST',
    headers: await saasHeaders()
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to send reset email')
  }
  return res.json()
}

export async function resendInvite(userId) {
  const res = await fetch(`${API_BASE}/saas/users/${userId}/resend-invite`, {
    method: 'POST',
    headers: await saasHeaders()
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to resend invite')
  }
  return res.json()
}

export async function createOrgAccount(orgId, email, adminName) {
  const res = await fetch(`${API_BASE}/saas/users`, {
    method: 'POST',
    headers: await saasHeaders(),
    body: JSON.stringify({ org_id: orgId, email, admin_name: adminName })
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to create account')
  }
  return res.json()
}

export async function updateOrgEmail(userId, orgId, email) {
  const res = await fetch(`${API_BASE}/saas/users/${userId}/email`, {
    method: 'PATCH',
    headers: await saasHeaders(),
    body: JSON.stringify({ email, org_id: orgId })
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to update email')
  }
  await supabase.from('organizations').update({ email }).eq('id', orgId)
}
