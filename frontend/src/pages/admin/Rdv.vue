<script setup>
import { ref, onMounted, reactive } from 'vue'
import RdvFilters from '@/components/rdv/RdvFilters.vue'
import RdvList from '@/components/rdv/RdvList.vue'
import RdvModal from '@/components/rdv/RdvModal.vue'
import PlanningView from '@/components/rdv/PlanningView.vue'
import { fetchPlannedAppointments } from '@/services/appointments.service'
import RdvActionModal from '@/components/rdv/RdvActionModal.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import {
  cancelAppointment,
  noShowAppointment,
  deleteAppointment,
  createAppointment,
  updateAppointment
} from '@/services/appointments.service'
import {
  fetchServices,
  fetchServiceCategories
} from '@/services/services.service'
import { fetchStaff } from '@/services/staff.service'
import { useToast } from '@/composables/useToast'

const { toast } = useToast()

const planningRef    = ref(null)
const tab            = ref('list')   // 'list' | 'planning'
const selectedDate   = ref(null)
const selectedStaffId = ref(null)
const assignment     = ref('all')
const rdvs           = ref([])
const services       = ref([])
const staff          = ref([])
const categories     = ref([])
const location       = ref('all')
const showModal      = ref(false)
const editing        = ref(null)
const showActionModal = ref(false)
const selectedRdv    = ref(null)

// Confirmation directe depuis la liste
const confirm = reactive({ show: false, title: '', message: '', action: null })

function askConfirm(title, message, action) {
  confirm.title   = title
  confirm.message = message
  confirm.action  = action
  confirm.show    = true
}

async function runConfirm() {
  if (confirm.action) await confirm.action()
  confirm.show = false
  refreshAll()
}

async function quickCancel(rdv)  { askConfirm('Annuler le RDV', `Annuler le RDV de ${rdvClientName(rdv)} ?`, async () => { await cancelAppointment(rdv.id); toast.success('RDV annulé') }) }
async function quickNoshow(rdv)  { askConfirm('Marquer absent', `Marquer ${rdvClientName(rdv)} comme absent ?`, async () => { await noShowAppointment(rdv.id); toast.success('Client marqué absent') }) }
async function quickDelete(rdv)  { askConfirm('Supprimer le RDV', `Supprimer définitivement le RDV de ${rdvClientName(rdv)} ? Action irréversible.`, () => deleteAppointment(rdv.id)) }

function rdvClientName(rdv) {
  const c = rdv?.client
  return c ? [c.name, c.last_name].filter(Boolean).join(' ') : 'ce client'
}

function refreshAll() {
  load()
  planningRef.value?.refresh()
}

async function load() {
  try {
    rdvs.value = await fetchPlannedAppointments({
      date: selectedDate.value,
      staffId: selectedStaffId.value,
      assignment: assignment.value,
      location: location.value
    })
  } catch (err) {
    console.error('LOAD RDVS ERROR', err)
  }
}

async function handleCancelRdv() {
  if (!selectedRdv.value) return
  await cancelAppointment(selectedRdv.value.id)
  toast.success('RDV annulé')
  closeActionModal()
  refreshAll()
}

async function handleNoShowRdv() {
  if (!selectedRdv.value) return
  await noShowAppointment(selectedRdv.value.id)
  toast.success('Client marqué absent')
  closeActionModal()
  refreshAll()
}

async function handleDeleteRdv() {
  if (!selectedRdv.value) return
  await deleteAppointment(selectedRdv.value.id)
  closeActionModal()
  refreshAll()
}

function closeActionModal() {
  showActionModal.value = false
  selectedRdv.value = null
}

function onRdvAction(payload) {
  if (payload.type === 'open') {
    selectedRdv.value = payload.rdv
    showActionModal.value = true
  }
}

function openFromPlanning(a) {
  selectedRdv.value = a
  showActionModal.value = true
}

function handleEditRdv() {
  if (!selectedRdv.value) return
  editing.value = selectedRdv.value
  showActionModal.value = false
  selectedRdv.value = null
  showModal.value = true
}

function onFiltersChange(f) {
  selectedDate.value = f.date
  selectedStaffId.value = f.staffId
  assignment.value = f.assignment
  location.value = f.location || 'all'
  load()
}

function openCreate() {
  editing.value = null
  showModal.value = true
}

function openEdit(rdv) {
  editing.value = rdv
  showModal.value = true
}

async function onSaved(payload) {
  if (payload.id) {
    await updateAppointment(payload)
  } else {
    await createAppointment(payload)
  }
  showModal.value = false
  refreshAll()
}

onMounted(async () => {
  try {
    services.value = await fetchServices()
    categories.value = await fetchServiceCategories()
    staff.value = await fetchStaff()
    await load()
  } catch (err) {
    console.error('RDV INIT ERROR', err)
  }
})
</script>

<template>
  <div class="page rdv-page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Rendez-vous</h1>
        <p v-if="tab === 'list'" class="page-desc">{{ rdvs.length }} rendez-vous trouvé{{ rdvs.length !== 1 ? 's' : '' }}</p>
        <p v-else class="page-desc">Vue planning collaborateurs</p>
      </div>
      <div class="rdv-header-actions">
        <!-- Toggle Liste / Planning -->
        <div class="view-toggle">
          <button :class="['vt-btn', tab === 'list' && 'active']" @click="tab = 'list'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            Liste
          </button>
          <button :class="['vt-btn', tab === 'planning' && 'active']" @click="tab = 'planning'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Planning
          </button>
        </div>
        <button class="btn btn-primary" @click="openCreate">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Nouveau RDV
        </button>
      </div>
    </div>

    <!-- Vue Liste -->
    <template v-if="tab === 'list'">
      <div class="filters-bar">
        <RdvFilters :staff="staff" @change="onFiltersChange" />
      </div>
      <div class="data-card">
        <RdvList
          :rdvs="rdvs" :staff="staff"
          @open="openFromPlanning"
          @cancel="quickCancel"
          @noshow="quickNoshow"
          @delete="quickDelete"
        />
      </div>
    </template>

    <!-- Vue Planning -->
    <template v-else>
      <PlanningView ref="planningRef" :staff="staff.filter(s => s.is_active)" @open-rdv="openFromPlanning" />
    </template>

    <!-- Modals -->
    <RdvModal
      v-if="showModal"
      :open="showModal"
      :rdv="editing"
      :services="services"
      :categories="categories"
      :staff="staff"
      @close="showModal = false"
      @save="onSaved"
    />

    <RdvActionModal
      v-if="showActionModal"
      :rdv="selectedRdv"
      @close="closeActionModal"
      @editRdv="handleEditRdv"
      @cancelRdv="handleCancelRdv"
      @noshowRdv="handleNoShowRdv"
      @deleteRdv="handleDeleteRdv"
    />

    <ConfirmModal
      :open="confirm.show"
      :title="confirm.title"
      :message="confirm.message"
      confirmText="Confirmer"
      @close="confirm.show = false"
      @confirm="runConfirm"
    />
  </div>
</template>

<style scoped>
.rdv-page {
  max-width: none;
  padding-top: 24px;
}

.rdv-page :deep(.page-header),
.rdv-page .page-header {
  align-items: center;
  margin-bottom: 14px;
}

.rdv-page .page-title {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.rdv-page .page-desc {
  color: var(--text-muted);
  font-weight: 600;
}

.rdv-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.filters-bar {
  margin-bottom: 12px;
}

.data-card {
  background: transparent;
  border: 0;
  box-shadow: none;
  overflow: visible;
}

.view-toggle {
  display: flex;
  background: var(--bg-soft);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
}
.vt-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  transition: all .15s;
}
.vt-btn.active {
  background: var(--bg-card);
  color: var(--primary);
  box-shadow: 0 1px 2px rgba(40,31,10,.08);
}

@media (max-width: 768px) {
  .rdv-page {
    padding-top: 14px;
  }

  .rdv-page .page-header {
    align-items: stretch;
    gap: 12px;
  }

  .rdv-header-actions {
    justify-content: flex-start;
  }

  .view-toggle,
  .rdv-header-actions .btn {
    width: 100%;
  }

  .vt-btn,
  .rdv-header-actions .btn {
    justify-content: center;
    flex: 1;
  }
}
</style>
