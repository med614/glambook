<script setup>
import { ref, onMounted } from 'vue'
import RdvFilters from '@/components/rdv/RdvFilters.vue'
import RdvList from '@/components/rdv/RdvList.vue'
import RdvModal from '@/components/rdv/RdvModal.vue'
import { fetchPlannedAppointments } from '@/services/appointments.service'
import RdvActionModal from '@/components/rdv/RdvActionModal.vue'
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

const selectedDate = ref(null)
const selectedStaffId = ref(null)
const assignment = ref('all')
const rdvs = ref([])
const services = ref([])
const staff = ref([])
const categories = ref([])
const location = ref('all')
const showModal = ref(false)
const editing = ref(null)
const showActionModal = ref(false)
const selectedRdv = ref(null)

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
  closeActionModal()
  await load()
}

async function handleNoShowRdv() {
  if (!selectedRdv.value) return
  await noShowAppointment(selectedRdv.value.id)
  closeActionModal()
  await load()
}

async function handleDeleteRdv() {
  if (!selectedRdv.value) return
  await deleteAppointment(selectedRdv.value.id)
  closeActionModal()
  await load()
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
  await load()
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
  <div class="page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Rendez-vous</h1>
        <p class="page-desc">{{ rdvs.length }} rendez-vous trouvé{{ rdvs.length !== 1 ? 's' : '' }}</p>
      </div>
      <button class="btn btn-primary" @click="openCreate">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Nouveau RDV
      </button>
    </div>

    <!-- Filters -->
    <div class="filters-bar">
      <RdvFilters :staff="staff" @change="onFiltersChange" />
    </div>

    <!-- Table -->
    <div class="data-card">
      <RdvList :rdvs="rdvs" :staff="staff" @edit="openEdit" @action="onRdvAction" />
    </div>

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
      @cancelRdv="handleCancelRdv"
      @noshowRdv="handleNoShowRdv"
      @deleteRdv="handleDeleteRdv"
    />
  </div>
</template>
