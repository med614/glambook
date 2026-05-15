import { Router } from 'express'
import { supabase } from '../lib/supabase.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
const SET_PASSWORD_URL = `${FRONTEND_URL}/auth/set-password`

// Seuls admin et superadmin peuvent gérer les gestionnaires
function requireAdminOrAbove(req, res, next) {
  if (req.role !== 'admin' && req.role !== 'superadmin') {
    return res.status(403).json({ error: 'Forbidden: admin only' })
  }
  next()
}

router.use(requireAuth, requireAdminOrAbove)

// GET /managers — liste les gestionnaires de l'org
router.get('/', async (req, res) => {
  const orgId = req.orgId
  if (!orgId) return res.status(400).json({ error: 'No org_id' })

  // Récupère tous les users de l'org avec role=manager via admin API
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (error) return res.status(500).json({ error: error.message })

  const managers = data.users
    .filter(u => u.user_metadata?.org_id === orgId && u.user_metadata?.role === 'manager')
    .map(u => ({
      id: u.id,
      email: u.email,
      name: u.user_metadata?.manager_name || u.email,
      created_at: u.created_at,
      confirmed: !!u.email_confirmed_at
    }))

  res.json(managers)
})

// POST /managers/invite — invite un nouveau gestionnaire
router.post('/invite', async (req, res) => {
  const { email, name } = req.body
  const orgId = req.orgId
  if (!email || !orgId) return res.status(400).json({ error: 'email required' })

  // Vérifie que l'email n'existe pas déjà dans cette org
  const { data: existing } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const alreadyExists = existing?.users?.some(u =>
    u.email === email && u.user_metadata?.org_id === orgId
  )
  if (alreadyExists) return res.status(400).json({ error: 'Ce gestionnaire existe déjà.' })

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: SET_PASSWORD_URL,
    data: { org_id: orgId, role: 'manager', manager_name: name || email }
  })
  if (error) return res.status(400).json({ error: error.message })

  res.json({ id: data.user.id, email: data.user.email, name: name || email, confirmed: false })
})

// DELETE /managers/:id — supprime un gestionnaire
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  const orgId = req.orgId

  // Vérifie que le user appartient bien à l'org avant suppression
  const { data: u, error: fetchErr } = await supabase.auth.admin.getUserById(id)
  if (fetchErr || !u?.user) return res.status(404).json({ error: 'User not found' })
  if (u.user.user_metadata?.org_id !== orgId) return res.status(403).json({ error: 'Forbidden' })
  if (u.user.user_metadata?.role !== 'manager') return res.status(400).json({ error: 'Not a manager' })

  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) return res.status(500).json({ error: error.message })

  res.json({ ok: true })
})

export default router
