import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'

export function useUnassigned({ appointments, services, staff, fetchData, staffExternalConflict }) {
  const heavyAssignWarning = ref('')
  const pendingHeavyAssign = ref(null)
  const pendingStaff       = ref({})
  const assigningId        = ref(null)

  const unassigned = computed(() => {
    const rows = []
    for (const a of appointments.value) {
      if (a.type === 'walkin') continue
      if (['completed', 'cancelled', 'noshow'].includes(a.status)) continue
      const client = ((a.client?.name || '') + ' ' + (a.client?.last_name || '')).trim() || a.walkin_name || 'Client'
      const time   = a.start_time?.substring(11, 16) || '—'
      const date   = a.start_time?.substring(0, 10) || ''
      if (!a.appointment_services?.length) {
        if (!a.staff_id) rows.push({ id: a.id, svcId: null, time, date, client, service: 'Prestation non définie', serviceId: null, isHeavy: false, appointmentServiceId: null })
      } else {
        for (const as of a.appointment_services) {
          if (!as.staff?.id && !as.staff_id && as.status !== 'cancelled' && as.status !== 'completed') {
            const svcDef = services.value.find(s => s.id === as.service?.id)
            rows.push({ id: a.id, svcId: as.id, time, date, client, service: as.service?.name || 'Prestation non définie', serviceId: as.service?.id || null, isHeavy: !!svcDef?.is_heavy, categoryId: svcDef?.category_id || null, appointmentServiceId: as.id })
          }
        }
      }
    }
    return rows
  })

  function staffForUnassigned(row) {
    const { date, categoryId } = row
    const mapped = staff.value.map(s => {
      const absent    = date && s.absences?.some(a => a.start_date <= date && a.end_date >= date)
      const competent = categoryId && s.categories?.some(c => c.id === categoryId)
      return { ...s, _absent: !!absent, _competent: !!competent,
        disabled: absent ? true : undefined,
        hint:     absent ? 'En congé' : undefined
      }
    })
    const competent = mapped.filter(s => s._competent && !s._absent)
    const others    = mapped.filter(s => !s._competent && !s._absent)
    const absent    = mapped.filter(s => s._absent)
    const result    = []
    if (competent.length && (others.length || absent.length)) {
      result.push(...competent)
      result.push({ id: '__sep__', name: '── Autres ──', disabled: true })
    } else {
      result.push(...competent)
    }
    result.push(...others, ...absent)
    return result
  }

  async function assignStaff(appt, staffId) {
    if (!staffId) return
    const key = appt.svcId || appt.id
    assigningId.value = key
    try {
      if (appt.appointmentServiceId) {
        await supabase.from('appointment_services').update({ staff_id: staffId }).eq('id', appt.appointmentServiceId)
      } else {
        await supabase.from('appointment_services').insert({ appointment_id: appt.id, staff_id: staffId })
      }
      await supabase.from('appointments').update({ staff_id: staffId }).eq('id', appt.id)
      await fetchData()
    } catch(e) {
      console.error(e)
    } finally {
      assigningId.value = null
      delete pendingStaff.value[key]
    }
  }

  async function assignStaffWithCheck(row, staffId) {
    if (!staffId || staffId === '__sep__') return
    const extConflict = staffExternalConflict(staffId)
    if (extConflict) {
      const sm = staff.value.find(s => s.id === staffId)
      heavyAssignWarning.value = `${sm?.name || 'Ce collaborateur'} est en déplacement externe ${extConflict}. Confirmer quand même ?`
      pendingHeavyAssign.value = { row, staffId }
      return
    }
    if (row.isHeavy && row.categoryId) {
      const sm = staff.value.find(s => s.id === staffId)
      if (sm && !sm.categories?.some(c => c.id === row.categoryId)) {
        heavyAssignWarning.value = `"${row.service}" est une prestation complexe — ${sm.name} n'a pas la compétence requise. Confirmer quand même ?`
        pendingHeavyAssign.value = { row, staffId }
        return
      }
    }
    await assignStaff(row, staffId)
  }

  async function confirmHeavyAssign() {
    if (!pendingHeavyAssign.value) return
    const { row, staffId } = pendingHeavyAssign.value
    heavyAssignWarning.value = ''
    pendingHeavyAssign.value = null
    await assignStaff(row, staffId)
  }

  return {
    unassigned, staffForUnassigned,
    assignStaff, assignStaffWithCheck, confirmHeavyAssign,
    heavyAssignWarning, pendingHeavyAssign, pendingStaff, assigningId
  }
}
