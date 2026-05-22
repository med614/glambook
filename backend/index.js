import express from 'express'
import cors from 'cors'
import { supabase } from './lib/supabase.js'



import appointmentsRoutes from './routes/appointments.js'
import staffRoutes from './routes/staff.js'
import servicesRoutes from './routes/services.js'
import saasRoutes from './routes/saas.js'
import whatsappRoutes from './routes/whatsapp.js'
import managersRoutes from './routes/managers.js'
import bookingRoutes from './routes/booking.js'

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

app.use('/appointments', appointmentsRoutes)
app.use('/staff', staffRoutes)
app.use('/services', servicesRoutes)
app.use('/saas', saasRoutes)
app.use('/whatsapp', whatsappRoutes)
app.use('/managers', managersRoutes)
app.use('/booking', bookingRoutes)

// Route de test (health check)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'MedSolutions API' })
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`🚀 MedSolutions API running on port ${PORT}`)
})


// Test Supabase connection
app.get('/supabase-test', async (req, res) => {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .limit(1)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  res.json({ success: true, data })
})
