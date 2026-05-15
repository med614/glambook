import { Router } from 'express'
import { supabase } from '../lib/supabase.js'
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js'

const router = Router()

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
const SET_PASSWORD_URL = `${FRONTEND_URL}/auth/set-password`

// Toutes les routes nécessitent auth + rôle superadmin
router.use(requireAuth, requireSuperAdmin)

// POST /saas/users — create Supabase Auth user + link to org
router.post('/users', async (req, res) => {
  const { org_id, email, admin_name } = req.body
  if (!org_id || !email) return res.status(400).json({ error: 'org_id and email required' })

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: SET_PASSWORD_URL,
    data: { org_id, role: 'admin', admin_name }
  })
  if (error) return res.status(400).json({ error: error.message })

  const userId = data.user.id
  const { error: dbErr } = await supabase
    .from('organizations')
    .update({ email, admin_name, supabase_user_id: userId })
    .eq('id', org_id)
  if (dbErr) return res.status(500).json({ error: dbErr.message })

  res.json({ success: true, user_id: userId })
})

// POST /saas/users/:userId/reset-password
router.post('/users/:userId/reset-password', async (req, res) => {
  const { userId } = req.params
  const { data: userData, error: fetchErr } = await supabase.auth.admin.getUserById(userId)
  if (fetchErr || !userData?.user) return res.status(404).json({ error: 'User not found' })

  const { data: linkData, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: userData.user.email,
    options: { redirectTo: SET_PASSWORD_URL }
  })
  if (error) return res.status(400).json({ error: error.message })

  res.json({ success: true, email: userData.user.email, action_link: linkData?.properties?.action_link })
})

// POST /saas/users/:userId/resend-invite
router.post('/users/:userId/resend-invite', async (req, res) => {
  const { userId } = req.params
  const { data: userData, error: fetchErr } = await supabase.auth.admin.getUserById(userId)
  if (fetchErr || !userData?.user) return res.status(404).json({ error: 'User not found' })

  const { data: linkData, error } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email: userData.user.email,
    options: { redirectTo: SET_PASSWORD_URL, data: userData.user.user_metadata }
  })
  if (error) return res.status(400).json({ error: error.message })

  res.json({ success: true, email: userData.user.email, action_link: linkData?.properties?.action_link })
})

// PATCH /saas/users/:userId/email
router.patch('/users/:userId/email', async (req, res) => {
  const { userId } = req.params
  const { email, org_id } = req.body
  if (!email) return res.status(400).json({ error: 'email required' })

  const { error } = await supabase.auth.admin.updateUserById(userId, { email })
  if (error) return res.status(400).json({ error: error.message })
  if (org_id) await supabase.from('organizations').update({ email }).eq('id', org_id)

  res.json({ success: true })
})

export default router
