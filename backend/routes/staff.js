import express from 'express'
import { getAllStaff } from '../controllers/staff.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()
router.use(requireAuth)
router.get('/', getAllStaff)

export default router
