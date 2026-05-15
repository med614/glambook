import { supabase } from '../lib/supabase.js'

// Vérifie le JWT Supabase et attache l'utilisateur à req.user
export async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing authorization token' })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired token' })

  req.user = data.user
  req.orgId = data.user.user_metadata?.org_id || null
  req.role = data.user.user_metadata?.role || 'admin'
  next()
}

// Vérifie que l'utilisateur est super-admin
export function requireSuperAdmin(req, res, next) {
  if (req.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden: super admin only' })
  next()
}
