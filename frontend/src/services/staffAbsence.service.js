import { supabase } from '@/lib/supabase'

/* =========================
   FETCH ABSENCES FOR STAFF
========================= */
export async function fetchStaffAbsences(staffId) {
  const { data, error } = await supabase
    .from('staff_absences')
    .select('*')
    .eq('staff_id', staffId)
    .order('start_date')

  if (error) throw error
  return data
}

/* =========================
   CREATE ABSENCE
========================= */
export async function createStaffAbsence(payload) {
  const { error } = await supabase
    .from('staff_absences')
    .insert(payload)

  if (error) throw error
}

/* =========================
   DELETE ABSENCE
========================= */
export async function deleteStaffAbsence(id) {
  const { error } = await supabase
    .from('staff_absences')
    .delete()
    .eq('id', id)

  if (error) throw error
}