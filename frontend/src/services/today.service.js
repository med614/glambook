import api from './api'
import { getOrgId } from '@/composables/useOrgId'

export const todayService = {
    getAppointments(date) {
        // Backend API takes ?date=YYYY-MM-DD
        return api.get('/appointments', { params: { date } })
    },

    getStaff() {
        return api.get('/staff')
    },

    getAllServices() {
        return api.get('/services')
    },

    createWalkin(data) {
        return api.post('/appointments', { ...data, type: 'walkin', status: 'waiting' })
    }
}

import { supabase } from '@/lib/supabase'

function localNowIso() {
  const now = new Date()
  return now.toLocaleDateString('en-CA') + 'T' + now.toTimeString().substring(0, 8)
}

export async function closeDay(date) {
    const startOfDay = `${date}T00:00:00`
    const endOfDay   = `${date}T23:59:59`

    // Passer tous les RDV non terminés en completed
    await supabase
        .from('appointments')
        .update({ status: 'completed', end_time: localNowIso() })
        .in('status', ['scheduled', 'in_progress', 'confirmed'])
        .gte('start_time', startOfDay)
        .lte('start_time', endOfDay)

    // Compter les walk-ins non pris en charge avant suppression
    const { count } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'walkin')
        .eq('status', 'waiting')
        .gte('start_time', startOfDay)
        .lte('start_time', endOfDay)

    // Supprimer les walk-ins en attente
    await supabase
        .from('appointments')
        .delete()
        .eq('type', 'walkin')
        .eq('status', 'waiting')
        .gte('start_time', startOfDay)
        .lte('start_time', endOfDay)

    // Logger le nombre de walk-ins non pris en charge
    if (count > 0) {
        const orgId = await getOrgId()
        await supabase.from('walkin_daily_log').insert({
            date,
            unserved_count: count,
            organization_id: orgId
        })
    }
}

export async function completeAppointment(appointmentId, endTime) {
    const { error } = await supabase
        .from('appointments')
        .update({ status: 'completed', end_time: endTime ?? localNowIso() })
        .eq('id', appointmentId)
    if (error) throw error
}

export async function serveWalkin(appointmentId, staffId, serviceId) {
    const { error } = await supabase
        .from('appointments')
        .update({ status: 'in_progress', staff_id: staffId })
        .eq('id', appointmentId)
    if (error) throw error

    // Mise à jour ou création du lien prestation
    const { data: existing } = await supabase
        .from('appointment_services')
        .select('id')
        .eq('appointment_id', appointmentId)
        .limit(1)
        .single()

    if (existing) {
        await supabase
            .from('appointment_services')
            .update({ staff_id: staffId, ...(serviceId ? { service_id: serviceId } : {}) })
            .eq('id', existing.id)
    } else if (serviceId) {
        await supabase
            .from('appointment_services')
            .insert({ appointment_id: appointmentId, service_id: serviceId, staff_id: staffId })
    }
}
