import { supabase } from '@/lib/supabase'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000'

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

export async function fetchManagers() {
  const res = await fetch(`${API}/managers`, { headers: await authHeaders() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function inviteManager(email, name) {
  const res = await fetch(`${API}/managers/invite`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ email, name })
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Erreur invitation')
  }
  return res.json()
}

export async function deleteManager(id) {
  const res = await fetch(`${API}/managers/${id}`, {
    method: 'DELETE',
    headers: await authHeaders()
  })
  if (!res.ok) throw new Error(await res.text())
}
