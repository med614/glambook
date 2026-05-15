import express from 'express'
import { getAllServices } from '../controllers/services.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()
router.use(requireAuth)
router.get('/', getAllServices)

export default router
