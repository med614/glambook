/**
 * Smart staff ranking algorithm.
 * Scores each staff member based on:
 *  1. Availability (absence, external RDV at target time)
 *  2. Skill match (category)
 *  3. Workload at the target time slot (time-aware, not whole-day)
 *  4. Daily fatigue — cumulative prestations completed/in-progress today
 * Tie-breaker: staff who last worked furthest in the past goes first (equitable rotation).
 */

function timeToMin(str) {
  if (!str) return 0
  const t = str.length > 5 ? str.substring(11, 16) : str
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function isInPeriod(min, period) {
  if (period === 'allday')   return true
  if (period === 'morning')   return min < 13 * 60
  if (period === 'afternoon') return min >= 13 * 60 && min < 18 * 60
  if (period === 'evening')   return min >= 18 * 60
  return false
}

/**
 * @param {Object} opts
 * @param {Array}  opts.staffList      - raw staff records (with .absences, .categories)
 * @param {string} opts.serviceId      - selected service id
 * @param {Array}  opts.services       - all services (with .category_id, .duration_minutes)
 * @param {string} opts.targetDate     - "YYYY-MM-DD"
 * @param {string} opts.targetTime     - "HH:MM" (start of the appointment)
 * @param {Array}  opts.appointments   - appointments for that day (for workload & external check)
 * @returns {Array} scored + sorted staff, each with meta fields _recommended, _unavailable, etc.
 */
export function rankStaff({ staffList, serviceId, services, targetDate, targetTime, appointments = [] }) {
  const service    = services?.find(s => s.id === serviceId)
  const catId      = service?.category_id
  const duration   = service?.duration_minutes || 30
  const targetMin  = timeToMin(targetTime || '09:00')
  const targetEnd  = targetMin + duration

  const scored = (staffList || [])
    .filter(sm => sm.id && sm.id !== '__sep__')
    .map(sm => {
      // ── 1. Absence ──────────────────────────────────────────────────────────
      const isAbsent = !!(targetDate && sm.absences?.some(
        a => a.start_date <= targetDate && a.end_date >= targetDate
      ))

      // ── 2. External RDV conflict at target time ──────────────────────────
      const hasExternal = appointments.some(a => {
        if (!a.is_external) return false
        if (['cancelled', 'completed', 'noshow'].includes(a.status)) return false
        const staffMatch = a.appointment_services?.some(
          as => (as.staff?.id || as.staff_id) === sm.id
        )
        if (!staffMatch) return false
        return a.external_period ? isInPeriod(targetMin, a.external_period) : true
      })

      const isUnavailable     = isAbsent || hasExternal
      const unavailableReason = isAbsent ? 'En congé' : hasExternal ? 'Déplacement ext.' : null

      // ── 3. Skill match ───────────────────────────────────────────────────
      const isCompetent = catId ? !!sm.categories?.some(c => c.id === catId) : false

      // ── 4. Fatigue journalière ───────────────────────────────────────────
      // Nombre de prestations completed + in_progress aujourd'hui pour ce staff
      const dailyLoad = appointments.filter(a => {
        if (!['completed', 'in_progress'].includes(a.status)) return false
        if (a.is_external) return false
        if (a.start_time?.slice(0, 10) !== targetDate &&
            !(a.type === 'walkin' && a.status === 'in_progress')) return false
        return a.appointment_services?.some(
          as => (as.staff?.id || as.staff_id) === sm.id
        )
      }).reduce((sum, a) => {
        // Compter le nombre de lignes de prestation assignées à ce staff
        return sum + (a.appointment_services?.filter(
          as => (as.staff?.id || as.staff_id) === sm.id
        ).length || 0)
      }, 0)

      // ── 5. Time-aware workload ───────────────────────────────────────────
      // Count active non-external appointments whose slot overlaps [targetMin, targetEnd]
      const workload = appointments.filter(a => {
        if (['cancelled', 'completed', 'noshow'].includes(a.status)) return false
        if (a.is_external) return false
        if (a.type === 'walkin' && a.status === 'waiting') return false
        const staffAs = a.appointment_services?.find(
          as => (as.staff?.id || as.staff_id) === sm.id
        )
        if (!staffAs) return false
        // Walkin in_progress : start_time = heure d'entrée en file (pas heure réelle de service)
        // → bypass date et overlap, le staff est occupé maintenant quel que soit le jour
        if (a.type === 'walkin' && a.status === 'in_progress') return true
        if (a.start_time?.slice(0, 10) !== targetDate) return false
        const aStart = timeToMin(a.start_time)
        const aEnd   = aStart + (staffAs.service?.duration_minutes || 30)
        return targetMin < aEnd && targetEnd > aStart
      }).length

      // ── 6. Last work date (tie-breaker) ─────────────────────────────────
      // ISO string of the most recent completed/in_progress appointment for this staff.
      // Null means never worked → highest priority in case of tie.
      const lastWorkTs = appointments
        .filter(a => {
          if (!['completed', 'in_progress'].includes(a.status)) return false
          if (a.is_external) return false
          return a.appointment_services?.some(
            as => (as.staff?.id || as.staff_id) === sm.id
          )
        })
        .map(a => a.start_time || '')
        .sort()
        .at(-1) ?? null

      // ── Score ────────────────────────────────────────────────────────────
      let score = 0
      if (isUnavailable) {
        score = -1000
      } else {
        if (isCompetent) score += 10
        // Workload time-aware : 5→3→1→0 pour 0,1,2,3+ slots en overlap
        score += [5, 3, 1, 0][Math.min(workload, 3)]
        // Fatigue journalière : -1 par prestation terminée/en cours, plafonné à -5
        score -= Math.min(dailyLoad, 5)
      }

      return {
        ...sm,
        _absent:           isAbsent,
        _externalConflict: hasExternal,
        _unavailable:      isUnavailable,
        _unavailableReason: unavailableReason,
        _competent:        isCompetent,
        _workload:         workload,
        _dailyLoad:        dailyLoad,
        _lastWorkTs:       lastWorkTs,
        _score:            score,
        _recommended:      false // set below
      }
    })

  // Sort: available first (score desc), tie-break by last work date asc (least recent first)
  scored.sort((a, b) => {
    if (a._unavailable !== b._unavailable) return a._unavailable ? 1 : -1
    if (b._score !== a._score) return b._score - a._score
    // Equal score → prefer staff who last worked furthest in the past (or never worked)
    if (a._lastWorkTs === b._lastWorkTs) return 0
    if (!a._lastWorkTs) return -1  // a never worked → a goes first
    if (!b._lastWorkTs) return 1   // b never worked → b goes first
    return a._lastWorkTs < b._lastWorkTs ? -1 : 1
  })

  // Tag the best available candidate
  const bestIdx = scored.findIndex(s => !s._unavailable)
  if (bestIdx !== -1) scored[bestIdx]._recommended = true

  return scored
}
