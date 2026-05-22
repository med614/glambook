<script setup>
import { ref, onMounted, computed } from 'vue'
import { fetchServices, fetchServiceCategories, createService, updateService, toggleService, deleteService } from '../../services/services.service'
import ServiceModal from '../../components/admin/ServiceModal.vue'
import ConfirmModal from '../../components/common/ConfirmModal.vue'
import DropdownActions from '@/components/common/DropdownActions.vue'

const services   = ref([])
const categories = ref([])
const filterCategory = ref('')
const searchQuery    = ref('')
const showModal      = ref(false)
const selectedService = ref(null)
const showConfirmModal = ref(false)
const serviceToDelete  = ref(null)

onMounted(load)

async function load() {
  const [svc, cats] = await Promise.all([fetchServices(), fetchServiceCategories()])
  services.value   = svc
  categories.value = cats
}

function openCreate() { selectedService.value = null; showModal.value = true }
function openEdit(s)  { selectedService.value = s;    showModal.value = true }

async function save(payload) {
  if (payload.id) {
    await updateService(payload.id, payload)
  } else {
    await createService(payload)
  }
  showModal.value = false
  await load()
}

async function toggleStatus(s) {
  await toggleService(s.id, !s.is_active)
  await load()
}

async function toggleWhatsapp(s) {
  await updateService(s.id, { ...s, whatsapp_enabled: !s.whatsapp_enabled })
  await load()
}

function remove(s) { serviceToDelete.value = s; showConfirmModal.value = true }

async function confirmDelete() {
  if (!serviceToDelete.value) return
  await deleteService(serviceToDelete.value.id)
  showConfirmModal.value = false
  serviceToDelete.value = null
  await load()
}

const filteredList = computed(() =>
  services.value.filter(s => {
    if (filterCategory.value && s.category_id !== filterCategory.value) return false
    if (searchQuery.value && !s.name.toLowerCase().includes(searchQuery.value.toLowerCase())) return false
    return true
  })
)

function catColor(s) {
  return s.service_categories?.color || '#94a3b8'
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Catalogue</h1>
        <p class="page-desc">{{ filteredList.length }} prestation{{ filteredList.length !== 1 ? 's' : '' }}</p>
      </div>
      <button class="btn btn-primary" @click="openCreate">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Ajouter
      </button>
    </div>

    <!-- Filtres -->
    <div class="filters-bar">
      <div class="search-input-wrap" style="width:260px;">
        <svg class="search-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input v-model="searchQuery" type="text" placeholder="Rechercher…" />
      </div>
      <select v-model="filterCategory" style="width:auto;min-width:180px;">
        <option value="">Toutes les catégories</option>
        <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </div>

    <div class="data-card">
      <table class="table">
        <thead>
          <tr>
            <th>Prestation</th>
            <th>Catégorie</th>
            <th>Durée</th>
            <th>Prix</th>
            <th>Statut</th>
            <th>WhatsApp</th>
            <th style="width:56px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in filteredList" :key="s.id" @click="openEdit(s)" style="cursor:pointer">
            <td>
              <div style="font-weight:600;color:var(--text-main);">{{ s.name }}</div>
              <div v-if="s.is_heavy" style="font-size:11px;color:var(--orange);margin-top:2px;">Service lourd</div>
            </td>
            <td>
              <span v-if="s.service_categories" class="cat-badge" :style="{ background: catColor(s) + '22', color: catColor(s), borderColor: catColor(s) + '55' }">
                {{ s.service_categories.name }}
              </span>
              <span v-else style="color:var(--text-muted);font-size:13px;">—</span>
            </td>
            <td>
              <span style="color:var(--text-muted);font-size:13px;">{{ s.duration_minutes }} min</span>
            </td>
            <td>
              <span v-if="s.price != null" style="font-weight:700;font-size:13px;color:var(--text-main);">{{ s.price }} DH</span>
              <span v-else style="color:var(--text-muted);font-size:13px;">Sur devis</span>
            </td>
            <td>
              <div style="display:flex;align-items:center;gap:10px;">
                <label class="toggle" @click.stop>
                  <input type="checkbox" :checked="s.is_active" @change="toggleStatus(s)" />
                  <span class="toggle-switch"></span>
                </label>
                <span :class="s.is_active ? 'badge badge-green' : 'badge badge-gray'">
                  {{ s.is_active ? 'Actif' : 'Inactif' }}
                </span>
              </div>
            </td>
            <td>
              <label class="toggle" @click.stop>
                <input type="checkbox" :checked="s.whatsapp_enabled" @change="toggleWhatsapp(s)" />
                <span class="toggle-switch toggle-switch--green"></span>
              </label>
            </td>
            <td>
              <DropdownActions
                :actions="[
                  { label: 'Modifier', icon: 'edit', onClick: () => openEdit(s) },
                  { label: 'Supprimer', icon: 'trash', onClick: () => remove(s), class: 'danger' }
                ]"
              />
            </td>
          </tr>
          <tr v-if="!filteredList.length">
            <td colspan="5" class="empty-state">Aucune prestation trouvée.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <ServiceModal
      :open="showModal"
      :service="selectedService"
      :categories="categories"
      @save="save"
      @close="showModal = false"
    />

    <ConfirmModal
      :open="showConfirmModal"
      title="Supprimer la prestation"
      :message="`Êtes-vous sûr de vouloir supprimer « ${serviceToDelete?.name} » ?`"
      confirmText="Supprimer"
      @close="showConfirmModal = false"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>

.cat-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid;
  font-size: 12px;
  font-weight: 600;
}
</style>
