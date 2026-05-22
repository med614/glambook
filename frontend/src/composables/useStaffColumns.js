import { computed } from 'vue'

const isoToLocalHHMM = iso => {
  if (!iso) return ''
  const d = new Date(iso)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

const isoToLocalMin = iso => {
  if (!iso) return 0
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

export function useStaffColumns({ appointments, staff, flaggedClientIds, showCompleted, getToday, nowMs }) {

  function isToday(a) {
    const ts = a.end_time || a.start_time || ''
    if (!ts) return false
    return new Date(ts).toLocaleDateString('en-CA') === getToday()
  }

  function isSvcVisible(a, svc) {
    if (a.status === 'cancelled')    return isToday(a) && showCompleted.value
    if (svc?.status === 'cancelled') return showCompleted.value
    if (a.status === 'completed')    return isToday(a) && showCompleted.value
    if (svc?.status === 'completed') return showCompleted.value
    return true
  }

  function svcTimeRange(a, svc) {
    const startIso = svc?.start_time || a.start_time || ''
    const startStr = isoToLocalHHMM(startIso)
    const dur = svc?.service?.duration_minutes
    let endStr = ''
    if (dur && startStr) {
      const startMin = isoToLocalMin(startIso)
      const total    = startMin + dur
      endStr = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    } else if (a.end_time) {
      endStr = isoToLocalHHMM(a.end_time)
    }
    return startStr + (endStr ? '–' + endStr : '')
  }

  function svcDelayMin(svc, status) {
    if (!nowMs || !svc?.start_time || status === 'past' || status === 'cancelled' || status === 'noshow') return 0
    const dur = (svc?.service?.duration_minutes || 0) * 60000
    const endMs = new Date(svc.start_time).getTime() + dur
    const delay = Math.floor((nowMs.value - endMs) / 60000)
    return delay > 0 ? delay : 0
  }

  function mapApptWithSvc(a, svc) {
    const svcDone      = svc?.status === 'completed'
    const svcCancelled = svc?.status === 'cancelled'
    const status = a.status === 'noshow'     ? 'noshow'
      : a.status === 'cancelled'             ? 'cancelled'
      : svcCancelled                         ? 'cancelled'
      : svcDone                              ? 'past'
      : a.status === 'in_progress'           ? 'current'
      : a.status === 'completed'             ? 'past'
      : 'upcoming'
    const apptDate  = (svc?.start_time || a.start_time || '').slice(0, 10)
    const isOverdue = !!apptDate && apptDate < getToday() && (status === 'current' || status === 'upcoming')
    return {
      id:         a.id,
      svcId:      svc?.id || null,
      svcDone,
      time:       svcTimeRange(a, svc),
      client:     ((a.client?.name || '') + ' ' + (a.client?.last_name || '')).trim() || a.walkin_name || '—',
      service:    svc?.service?.name || 'Prestation non définie',
      duration:   svc?.service?.duration_minutes || null,
      status,
      delayMin:   svcDelayMin(svc, status),
      isExternal: !!a.is_external,
      isWalkin:   a.type === 'walkin',
      isParallel:     !!svc?.is_parallel,
      isFlagged:      flaggedClientIds.value.has(a.client?.id),
      apptDate,
      isOverdue,
      paymentStatus:  a.payment_status || 'pending',
      paymentPending: a.payment_status !== 'paid' && (a.status === 'completed' || svcDone),
      price:          svc?.price_at_booking ?? null,
      raw:            a
    }
  }

  function terminalOrder(status) {
    return (status === 'past' || status === 'cancelled' || status === 'noshow') ? 1 : 0
  }

  const normOne = v => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

  function normSvc(svc) {
    if (!svc) return null
    return { ...svc, service: normOne(svc.service), staff: normOne(svc.staff) }
  }

  function staffAppts(sm) {
    const rows = []
    for (const a of appointments.value) {
      if (a.type === 'walkin') continue
      const allSvcs = a.appointment_services || []
      const svcs    = allSvcs.filter(as => (as.staff?.id ?? as.staff_id) === sm.id)
      if (svcs.length > 0) {
        for (const svc of svcs) {
          const ns = normSvc(svc)
          if (isSvcVisible(a, ns)) rows.push(mapApptWithSvc(a, ns))
        }
      } else if (allSvcs.length === 0 && a.staff_id === sm.id) {
        if (isSvcVisible(a, null)) rows.push(mapApptWithSvc(a, null))
      }
    }
    return rows.sort((a, b) => terminalOrder(a.status) - terminalOrder(b.status))
  }

  function staffWalkins(sm) {
    const rows = []
    for (const a of appointments.value) {
      if (a.type !== 'walkin' || a.status === 'waiting') continue
      const allSvcs = a.appointment_services || []
      const svcs    = allSvcs.filter(as => (as.staff?.id ?? as.staff_id) === sm.id)
      if (svcs.length > 0) {
        for (const svc of svcs) {
          const ns = normSvc(svc)
          if (isSvcVisible(a, ns)) rows.push(mapApptWithSvc(a, ns))
        }
      } else if (allSvcs.length === 0 && a.staff_id === sm.id) {
        if (isSvcVisible(a, null)) rows.push(mapApptWithSvc(a, null))
      }
    }
    return rows.sort((a, b) => terminalOrder(a.status) - terminalOrder(b.status))
  }

  function timeToMin(str) {
    if (!str) return 0
    if (str.length > 5) return isoToLocalMin(str)
    const [h, m] = str.split(':').map(Number)
    return h * 60 + (m || 0)
  }

  function rowsOverlap(a, b) {
    if (!a.raw.start_time || !b.raw.start_time) return false
    const aStart = timeToMin(a.raw.start_time)
    const aDur   = a.raw.appointment_services?.find(s => s.id === a.svcId)?.service?.duration_minutes || 30
    const bStart = timeToMin(b.raw.start_time)
    const bDur   = b.raw.appointment_services?.find(s => s.id === b.svcId)?.service?.duration_minutes || 30
    return aStart < bStart + bDur && aStart + aDur > bStart
  }

  const TERMINAL = ['past', 'cancelled', 'noshow']

  function overlappingSvcIds(sm) {
    const active = staffAppts(sm).filter(r => !TERMINAL.includes(r.status))
    const result = new Set()
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        if (rowsOverlap(active[i], active[j])) {
          if (active[i].svcId != null) result.add(active[i].svcId)
          if (active[j].svcId != null) result.add(active[j].svcId)
        }
      }
    }
    return result
  }

  function staffHasOverlap(sm) { return overlappingSvcIds(sm).size > 0 }

  function staffColor(sm) {
    const count = [...staffAppts(sm), ...staffWalkins(sm)]
      .filter(a => a.status !== 'past' && a.status !== 'cancelled' && a.status !== 'noshow').length
    if (count === 0) return 'free'
    if (count <= 2)  return 'busy'
    if (count <= 5)  return 'loaded'
    return 'full'
  }

  const staffWithColor = computed(() => staff.value.map(sm => ({ ...sm, statusColor: staffColor(sm) })))

  return { staffAppts, staffWalkins, overlappingSvcIds, staffHasOverlap, staffColor, staffWithColor }
}
