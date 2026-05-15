import express from 'express'
import { getAppointments, createAppointment } from '../controllers/appointments.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

router.use(requireAuth)
router.get('/', getAppointments)
router.post('/', createAppointment)

export default router
