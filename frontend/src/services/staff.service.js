import { supabase } from '@/lib/supabase'
import { getOrgId } from '@/composables/useOrgId'

export async function fetchStaff() {
  const { data, error } = await supabase
    .from('staff')
    .select(`
      id, name, is_active, avatar_url, join_date,
      staff_categories (
        service_categories ( id, name, color )
      ),
      staff_absences ( id, start_date, end_date )
    `)
    .order('name')

  if (error) throw error

  return data.map(s => ({
    id: s.id,
    name: s.name,
    is_active: s.is_active,
    avatar_url: s.avatar_url || null,
    join_date: s.join_date || null,
    categories: s.staff_categories.map(sc => sc.service_categories).filter(Boolean),
    absences: s.staff_absences
  }))
}

export async function uploadStaffAvatar(staffId, file) {
  const ext = file.name.split('.').pop()
  const path = `${staffId}.${ext}`

  const { error } = await supabase.storage
    .from('staff-avatars')
    .upload(path, file, { upsert: true })

  if (error) throw error

  const { data } = supabase.storage.from('staff-avatars').getPublicUrl(path)
  return data.publicUrl
}

async function saveCategories(staffId, categoryIds) {
  await supabase.from('staff_categories').delete().eq('staff_id', staffId)
  if (categoryIds?.length) {
    const { error } = await supabase
      .from('staff_categories')
      .insert(categoryIds.map(category_id => ({ staff_id: staffId, category_id })))
    if (error) throw error
  }
}

export async function createStaff(payload) {
  const { data: staff, error } = await supabase
    .from('staff')
    .insert({ organization_id: await getOrgId(), name: payload.name, is_active: true, join_date: payload.join_date || null })
    .select()
    .single()

  if (error) throw error

  await saveCategories(staff.id, payload.category_ids)

  if (payload.avatarFile) {
    const url = await uploadStaffAvatar(staff.id, payload.avatarFile)
    await supabase.from('staff').update({ avatar_url: url }).eq('id', staff.id)
  }

  return staff
}

export async function updateStaff(id, payload) {
  const updates = { name: payload.name, is_active: payload.is_active, join_date: payload.join_date || null }

  if (payload.avatarFile) {
    updates.avatar_url = await uploadStaffAvatar(id, payload.avatarFile)
  }

  const { error } = await supabase.from('staff').update(updates).eq('id', id)
  if (error) throw error

  await saveCategories(id, payload.category_ids)
}

export async function toggleStaff(id, isActive) {
  const { error } = await supabase.from('staff').update({ is_active: isActive }).eq('id', id)
  if (error) throw error
}

export async function deleteStaff(id) {
  const { error } = await supabase.from('staff').delete().eq('id', id)
  if (error) throw error
}
