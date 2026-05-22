import { computed } from 'vue'
import { supabase } from '@/lib/supabase'

const isoToLocalHHMM = iso => {
  if (!iso) return ''
  const d = new Date(iso)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

export function useQueue({ appointments, flaggedClientIds, fetchData, showConfirm, selectedWalkin, showServeModal }) {
  const walkinRows = computed(() => {
    const rows = []
    const normOne = v => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
    for (const a of appointments.value) {
      if (a.type !== 'walkin') continue
      if (['completed', 'cancelled', 'noshow'].includes(a.status)) continue
      const allSvcs     = a.appointment_services || []
      const unserved    = allSvcs.filter(as => as.status === 'active' && !(as.staff?.id || as.staff_id))
      const client      = ((a.client?.name || '') + ' ' + (a.client?.last_name || '')).trim() || a.walkin_name || 'Inconnu'
      const isFlagged   = flaggedClientIds.value.has(a.client?.id)
      const arrivalTime = isoToLocalHHMM(a.start_time) || '--:--'
      if (allSvcs.length === 0) {
        rows.push({ id: a.id, svcId: null, serviceId: null, appointment: a, client, isFlagged, arrivalTime, startTime: arrivalTime, serviceName: 'Prestation à définir', duration: null, price: null, _placeholder: true })
      } else {
        for (const as of unserved) {
          const svc = normOne(as.service)
          rows.push({ id: a.id, svcId: as.id, serviceId: svc?.id || null, appointment: a, client, isFlagged, arrivalTime, startTime: isoToLocalHHMM(as.start_time || a.start_time), serviceName: svc?.name || 'Prestation à définir', duration: svc?.duration_minutes || null, price: as.price_at_booking, _placeholder: false })
        }
      }
    }
    return rows.sort((a, b) => (a.appointment.start_time || '') < (b.appointment.start_time || '') ? -1 : 1)
  })

  function openQueueRow(row) {
    const normOne = v => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
    const rawAppt = row.appointment
    const filteredSvcs = row.svcId
      ? (rawAppt.appointment_services?.filter(as => as.id === row.svcId) || []).map(as => ({
          ...as,
          service: normOne(as.service),
          staff:   normOne(as.staff)
        }))
      : []
    selectedWalkin.value = {
      id:     row.id,
      client: row.client,
      time:   row.arrivalTime,
      raw:    { ...rawAppt, appointment_services: filteredSvcs }
    }
    showServeModal.value = true
  }

  function confirmDeleteQueueRow(row) {
    showConfirm({
      title: 'Supprimer la prestation',
      message: `Supprimer «${row.serviceName}» pour ${row.client} ?`,
      btnLabel: 'Supprimer',
      danger: true,
      onConfirm: () => deleteQueueRow(row)
    })
  }

  async function deleteQueueRow(row) {
    try {
      if (row.svcId) {
        const { data: allSvcs } = await supabase.from('appointment_services').select('id').eq('appointment_id', row.id)
        await supabase.from('appointment_services').delete().eq('id', row.svcId)
        if ((allSvcs || []).length <= 1) await supabase.from('appointments').delete().eq('id', row.id)
      } else {
        await supabase.from('appointments').delete().eq('id', row.id)
      }
      await fetchData()
    } catch(e) { console.error(e) }
  }

  return { walkinRows, openQueueRow, confirmDeleteQueueRow }
}
