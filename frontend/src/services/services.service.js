import { supabase } from '@/lib/supabase'
import { getOrgId } from '@/composables/useOrgId'

export async function fetchServices() {
  const { data, error } = await supabase
    .from('services')
    .select(`id, name, name_ar, duration_minutes, price, is_heavy, is_active, whatsapp_enabled, category_id, service_categories(id, name, color)`)
    .order('name')
  if (error) throw error
  return data
}

export async function createService(payload) {
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('services')
    .insert({
      organization_id: orgId,
      name: payload.name,
      name_ar: payload.name_ar ?? null,
      duration_minutes: payload.duration_minutes,
      price: payload.price ?? null,
      is_heavy: payload.is_heavy ?? false,
      is_active: payload.is_active ?? true,
      whatsapp_enabled: payload.whatsapp_enabled ?? false,
      category_id: payload.category_id || null
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updateService(id, payload) {
  const { error } = await supabase
    .from('services')
    .update({
      name: payload.name,
      name_ar: payload.name_ar ?? null,
      duration_minutes: payload.duration_minutes,
      price: payload.price ?? null,
      is_heavy: payload.is_heavy ?? false,
      is_active: payload.is_active ?? true,
      whatsapp_enabled: payload.whatsapp_enabled ?? false,
      category_id: payload.category_id || null
    })
    .eq('id', id)
  if (error) throw error
}

export async function toggleService(id, isActive) {
  const { error } = await supabase.from('services').update({ is_active: isActive }).eq('id', id)
  if (error) throw error
}

export async function deleteService(id) {
  const { error } = await supabase.from('services').delete().eq('id', id)
  if (error) throw error
}

export async function fetchServiceCategories() {
  const { data, error } = await supabase
    .from('service_categories')
    .select('id, name, color, is_active')
    .order('name')
  if (error) throw error
  return data
}

export async function createCategory(payload) {
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('service_categories')
    .insert({ organization_id: orgId, name: payload.name, color: payload.color || '#6366f1', is_active: true })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updateCategory(id, payload) {
  const { error } = await supabase
    .from('service_categories')
    .update({ name: payload.name, color: payload.color, is_active: payload.is_active })
    .eq('id', id)
  if (error) throw error
}

export async function deleteCategory(id) {
  const { error } = await supabase.from('service_categories').delete().eq('id', id)
  if (error) throw error
}
