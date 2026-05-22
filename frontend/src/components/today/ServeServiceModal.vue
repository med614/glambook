<script setup>
import { ref, computed } from 'vue'
import BaseModal from '../modal/BaseModal.vue'
import CustomSelect from '@/components/common/CustomSelect.vue'
import { supabase } from '@/lib/supabase'
import { rankStaff } from '@/composables/useStaffRanking'
import { useToast } from '@/composables/useToast'

const props = defineProps({
  appointment:       { type: Object, required: true },
  service:           { type: Object, required: true }, // { svcId, serviceId, serviceName, duration, startTime, price }
  staff:             { type: Array,  default: () => [] },
  services:          { type: Array,  default: () => [] },
  externalConflicts: { type: Object, default: () => ({}) },
  appointments:      { type: Array,  default: () => [] }
})
const emit = defineEmits(['close', 'refresh'])

const { toast } = useToast()
const selectedStaffId = ref(null)
const price           = ref(props.service.price ?? null)
const isLoading       = ref(false)
const externalAlert   = ref('')
const showExtConfirm  = ref(false)

const clientName = computed(() => {
  const c = props.appointment.client
  if (!c) return props.appointment.walkin_name || 'Inconnu'
  return ((c.name || '') + ' ' + (c.last_name || '')).trim() || 'Inconnu'
})

const isoToLocalHHMM = iso => {
  if (!iso) return ''
  const d = new Date(iso)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}
const arrivalTime = computed(() => isoToLocalHHMM(props.appointment.start_time) || '--:--')

function getRanked() {
  const now = new Date()
  return rankStaff({
    staffList:    props.staff.filter(s => s.is_active !== false),
    serviceId:    props.service.serviceId,
    services:     props.services,
    targetDate:   now.toLocaleDateString('en-CA'),
    targetTime:   `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
    appointments: props.appointments
  })
}

const staffOptions = computed(() => [
  { id: null, name: 'Non assigné' },
  ...getRanked().map(sm => ({
    ...sm,
    danger: sm._unavailable || undefined,
    hint:   sm._unavailableReason || undefined,
    badge:  sm._recommended ? 'Recommandé' : undefined
  }))
])

// Force staff unavailable
const forceConfirm = ref({ show: false, prevId: null, message: '' })

function onStaffChange(newId, oldId) {
  if (!newId) return
  const sm = getRanked().find(s => s.id === newId)
  if (sm?._unavailable) {
    forceConfirm.value = { show: true, prevId: oldId ?? null, message: `${sm.name} est indisponible (${sm._unavailableReason}). Forcer quand même ?` }
  }
}

function cancelForce() {
  selectedStaffId.value = forceConfirm.value.prevId
  forceConfirm.value = { show: false, prevId: null, message: '' }
}

function confirmForce() {
  forceConfirm.value = { show: false, prevId: null, message: '' }
}

async function handleServe() {
  const extConflict = selectedStaffId.value ? props.externalConflicts[selectedStaffId.value] : null
  if (extConflict) {
    const sm = props.staff.find(s => s.id === selectedStaffId.value)
    externalAlert.value = `${sm?.name || 'Ce collaborateur'} est en déplacement externe ${extConflict}.`
    showExtConfirm.value = true
    return
  }
  await doServe()
}

async function doServe() {
  showExtConfirm.value = false
  isLoading.value = true
  try {
    await supabase.from('appointment_services')
      .update({
        staff_id:         selectedStaffId.value || null,
        price_at_booking: price.value != null && price.value !== '' ? Number(price.value) : null
      })
      .eq('id', props.service.svcId)

    // Première affectation → appointment passe de waiting à in_progress
    if (props.appointment.status === 'waiting') {
      await supabase.from('appointments')
        .update({ status: 'in_progress' })
        .eq('id', props.appointment.id)
    }

    emit('refresh')
    emit('close')
    toast.success(`${props.service.serviceName} lancé`)
  } catch (e) {
    console.error('Erreur ServeServiceModal:', e)
    toast.error('Impossible de lancer la prestation')
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <BaseModal title="Lancer la prestation" @close="$emit('close')">

    <div class="modal-body">

      <!-- Bannière client -->
      <div class="client-banner">
        <div class="client-avatar">{{ clientName.charAt(0).toUpperCase() }}</div>
        <div>
          <div class="client-name">{{ clientName }}</div>
          <div class="client-meta">Arrivée {{ arrivalTime }}</div>
        </div>
      </div>

      <!-- Prestation concernée -->
      <div class="svc-card">
        <div class="svc-label">Prestation</div>
        <div class="svc-name">{{ service.serviceName }}</div>
        <div v-if="service.duration || service.startTime" class="svc-meta">
          <span v-if="service.duration" class="svc-dur">{{ service.duration }} min</span>
          <span v-if="service.startTime" class="svc-time">Prévue à {{ service.startTime }}</span>
        </div>
      </div>

      <!-- Collaborateur -->
      <div class="form-group">
        <label>Collaborateur</label>
        <CustomSelect
          v-model="selectedStaffId"
          :options="staffOptions"
          placeholder="Choisir un collaborateur…"
          :iconType="'none'"
          @update:modelValue="onStaffChange($event, selectedStaffId)"
        />
      </div>

      <!-- Prix -->
      <div class="form-group">
        <label>Prix</label>
        <div class="price-wrap">
          <input v-model="price" type="number" min="0" step="1" placeholder="—" class="price-input" />
          <span class="price-suffix">DH</span>
        </div>
      </div>

    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" @click="$emit('close')">Annuler</button>
      <button class="btn btn-primary" :disabled="isLoading" @click="handleServe">
        {{ isLoading ? 'Lancement…' : 'Lancer' }}
      </button>
    </div>

    <!-- Force staff indisponible -->
    <BaseModal title="Collaborateur indisponible" v-if="forceConfirm.show" @close="cancelForce">
      <div class="modal-body">
        <div class="warn-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          {{ forceConfirm.message }}
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="cancelForce">Annuler</button>
        <button class="btn btn-primary" @click="confirmForce">Forcer quand même</button>
      </div>
    </BaseModal>

    <!-- Déplacement externe -->
    <BaseModal title="Déplacement externe" v-if="showExtConfirm" @close="showExtConfirm = false">
      <div class="modal-body">
        <div class="warn-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          {{ externalAlert }}
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="showExtConfirm = false">Modifier</button>
        <button class="btn btn-primary" @click="doServe">Confirmer quand même</button>
      </div>
    </BaseModal>

  </BaseModal>
</template>

<style scoped>
/* ── Client banner ── */
.client-banner {
  display: flex; align-items: center; gap: 13px;
  padding: 13px 15px; background: var(--bg-soft);
  border: 1px solid var(--border); border-radius: 13px;
}
.client-avatar {
  width: 44px; height: 44px; border-radius: 50%;
  background: var(--primary-soft); color: var(--primary);
  font-size: 18px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  box-shadow: 0 0 0 2px var(--primary-mid);
}
.client-name { font-size: 14px; font-weight: 700; color: var(--text-main); }
.client-meta { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; }

/* ── Service card ── */
.svc-card {
  padding: 13px 15px;
  background: var(--blue-soft);
  border: 1px solid var(--blue);
  border-left: 2.5px solid var(--blue);
  border-radius: 12px;
}
.svc-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: var(--blue); margin-bottom: 5px; }
.svc-name  { font-size: 14px; font-weight: 700; color: var(--text-main); }
.svc-meta  { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
.svc-dur   { font-size: 10.5px; font-weight: 600; color: var(--text-muted); background: var(--bg-soft); border: 1px solid var(--border); border-radius: 6px; padding: 2px 7px; }
.svc-time  { font-size: 11px; font-weight: 600; color: var(--blue); }

</style>
