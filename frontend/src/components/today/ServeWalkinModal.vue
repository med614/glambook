<script setup>
import { ref, computed, watch } from 'vue'
import BaseModal from '../modal/BaseModal.vue'
import CustomSelect from '@/components/common/CustomSelect.vue'
import { supabase } from '@/lib/supabase'
import { rankStaff } from '@/composables/useStaffRanking'

const props = defineProps({
  walkin:            { type: Object, required: true },
  staff:             { type: Array, default: () => [] },
  services:          { type: Array, default: () => [] },
  externalConflicts: { type: Object, default: () => ({}) },
  appointments:      { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'refresh'])

const isLoading = ref(false)

// ── Lignes de prestations ────────────────────────────────────────────────────
function newLine() { return { id: Date.now() + Math.random(), serviceId: null, staffId: null, price: null } }

// Pré-remplir depuis les appointment_services existants du walkin
const one = v => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

const existingSvcs = props.walkin.raw?.appointment_services || []
const lines = ref(
  existingSvcs.length
    ? existingSvcs.map((s, i) => {
        const svc  = one(s.service)
        const stf  = one(s.staff)
        return {
          id:        i,
          svcRowId:  s.id,
          serviceId: svc?.id || null,
          staffId:   stf?.id || null,
          price:     s.price_at_booking ?? props.services.find(sv => sv.id === svc?.id)?.price ?? null
        }
      })
    : [newLine()]
)

function addLine()      { lines.value.push(newLine()) }
function removeLine(id) { if (lines.value.length > 1) lines.value = lines.value.filter(l => l.id !== id) }

watch(() => lines.value.map(l => l.serviceId), (newIds, oldIds) => {
  newIds.forEach((id, i) => {
    if (id && id !== oldIds?.[i]) {
      const svc = props.services.find(s => s.id === id)
      if (svc?.price != null) lines.value[i].price = svc.price
    }
  })
})

function getRanked(serviceId) {
  const now = new Date()
  const targetTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
  const targetDate = now.toLocaleDateString('en-CA')
  return rankStaff({
    staffList:    props.staff.filter(s => s.is_active !== false),
    serviceId,
    services:     props.services,
    targetDate,
    targetTime,
    appointments: props.appointments
  })
}

function staffOptionsFor(line) {
  const ranked = getRanked(line.serviceId)
  return [
    { id: null, name: 'Non assigné' },
    ...ranked.map(sm => ({
      ...sm,
      danger: sm._unavailable || undefined,
      hint:   sm._unavailableReason || undefined,
      badge:  sm._recommended ? 'Recommandé' : undefined
    }))
  ]
}

// Force staff indisponible — même pattern que RdvModal (watcher post-sélection)
const forceConfirm = ref({ show: false, lineId: null, staffId: null, prevStaffId: null, message: '' })

watch(
  () => lines.value.map(l => l.staffId),
  (newIds, oldIds) => {
    newIds.forEach((newId, i) => {
      if (!newId || newId === oldIds?.[i]) return
      const line = lines.value[i]
      const sm = getRanked(line.serviceId).find(s => s.id === newId)
      if (sm?._unavailable) {
        forceConfirm.value = {
          show: true,
          lineId: line.id,
          staffId: newId,
          prevStaffId: oldIds?.[i] ?? null,
          message: `${sm.name} est indisponible (${sm._unavailableReason}). Forcer quand même ?`
        }
      }
    })
  }
)

function confirmForce() {
  forceConfirm.value = { show: false, lineId: null, staffId: null, prevStaffId: null, message: '' }
}

function cancelForce() {
  const { lineId, prevStaffId } = forceConfirm.value
  const line = lines.value.find(l => l.id === lineId)
  if (line) line.staffId = prevStaffId
  forceConfirm.value = { show: false, lineId: null, staffId: null, prevStaffId: null, message: '' }
}

// ── Soumission ───────────────────────────────────────────────────────────────
const heavyAlert       = ref('')
const showHeavyConfirm = ref(false)
const externalAlert    = ref('')
const showExternalConfirm = ref(false)

function getExternalConflict() {
  const messages = []
  for (const line of lines.value) {
    if (!line.staffId) continue
    const conflict = props.externalConflicts[line.staffId]
    if (conflict) {
      const staffName = props.staff.find(s => s.id === line.staffId)?.name || 'Ce collaborateur'
      messages.push(`${staffName} est en déplacement externe ${conflict}.`)
    }
  }
  return messages.join(' ')
}

function getHeavyWarning() {
  for (const line of lines.value) {
    const svc = props.services.find(s => s.id === line.serviceId)
    if (!svc?.is_heavy) continue
    if (!line.staffId) return `"${svc.name}" est une prestation complexe — aucun collaborateur compétent n'est affecté.`
    const staff = props.staff.find(s => s.id === line.staffId)
    if (!staff?.categories?.some(c => c.id === svc.category_id))
      return `"${svc.name}" est une prestation complexe — ${staff?.name || 'ce collaborateur'} n'a pas la compétence requise.`
  }
  return ''
}

const missingService = computed(() => lines.value.some(l => l.staffId && !l.serviceId))
const canSubmit = computed(() => lines.value.some(l => l.serviceId) && !missingService.value)

async function handleServe() {
  if (!canSubmit.value) return
  const extWarn = getExternalConflict()
  if (extWarn) { externalAlert.value = extWarn; showExternalConfirm.value = true; return }
  const warn = getHeavyWarning()
  if (warn) { heavyAlert.value = warn; showHeavyConfirm.value = true; return }
  await doServe()
}

async function doServe() {
  showHeavyConfirm.value = false
  heavyAlert.value = ''
  isLoading.value = true
  try {
    const apptId      = props.walkin.id
    const mainStaffId = lines.value.find(l => l.staffId)?.staffId || null

    // Passer en in_progress uniquement si au moins un staff est assigné
    const apptUpdate = mainStaffId
      ? { status: 'in_progress', staff_id: mainStaffId }
      : { staff_id: null }
    await supabase.from('appointments').update(apptUpdate).eq('id', apptId)

    // Mettre à jour ou insérer chaque ligne
    for (const line of lines.value) {
      const priceVal = line.price != null && line.price !== '' ? Number(line.price) : null
      if (line.svcRowId) {
        await supabase.from('appointment_services')
          .update({ service_id: line.serviceId, staff_id: line.staffId, price_at_booking: priceVal })
          .eq('id', line.svcRowId)
      } else if (line.serviceId) {
        await supabase.from('appointment_services')
          .insert({ appointment_id: apptId, service_id: line.serviceId, staff_id: line.staffId, price_at_booking: priceVal })
      }
    }

    emit('refresh')
    emit('close')
  } catch (e) {
    console.error('Error saving:', e)
    alert('Erreur : ' + (e.message || 'Impossible d\'enregistrer'))
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <BaseModal title="Prestations du client" @close="$emit('close')">

    <div class="modal-body">

      <!-- Bannière client -->
      <div class="client-banner">
        <div class="client-avatar">{{ walkin.client?.charAt(0)?.toUpperCase() || '?' }}</div>
        <div>
          <div class="client-name">{{ walkin.client }}</div>
          <div class="client-meta">Arrivée {{ walkin.time }}</div>
        </div>
      </div>

      <!-- Message aide si walkin sans prestation définie -->
      <div v-if="!existingSvcs.length" class="hint-box">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Aucune prestation définie — sélectionnez une ou plusieurs prestations pour ce client.
      </div>

      <!-- Lignes prestations -->
      <div class="form-group">
        <label>Prestations</label>

        <div class="lines-list">
          <div v-for="(line, idx) in lines" :key="line.id" class="line-card">
            <!-- Ligne haut : numéro + service + supprimer -->
            <div class="line-top">
              <span class="line-num">{{ idx + 1 }}</span>
              <CustomSelect
                v-model="line.serviceId"
                :options="[{ id: null, name: 'Choisir une prestation *' }, ...services]"
                placeholder="Prestation *"
                :iconType="'none'"
                class="field-service"
              />
              <button v-if="lines.length > 1" type="button" class="remove-line-btn" @click="removeLine(line.id)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div v-else class="remove-placeholder"></div>
            </div>
            <!-- Ligne bas : staff + prix -->
            <div class="line-bottom">
              <CustomSelect
                v-model="line.staffId"
                :options="staffOptionsFor(line)"
                placeholder="Collaborateur"
                :iconType="'none'"
                :disabled="!line.serviceId"
                class="field-staff"
              />
              <div class="price-wrap">
                <input v-model="line.price" type="number" min="0" step="1" placeholder="—" class="price-input" />
                <span class="price-suffix">DH</span>
              </div>
            </div>
          </div>
        </div>

        <p v-if="missingService" class="form-error" style="margin:4px 0 0">Une prestation est requise pour chaque collaborateur sélectionné.</p>

        <button type="button" class="add-line-btn" @click="addLine">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Ajouter une prestation
        </button>
      </div>

    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" @click="$emit('close')">Annuler</button>
      <button class="btn btn-primary" :disabled="!canSubmit || isLoading" @click="handleServe">
        {{ isLoading ? 'Enregistrement…' : 'Enregistrer' }}
      </button>
    </div>

    <!-- Confirmation force staff indisponible -->
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

    <!-- Confirmation déplacement externe -->
    <BaseModal title="Déplacement externe" v-if="showExternalConfirm" @close="showExternalConfirm = false">
      <div class="modal-body">
        <div class="warn-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          {{ externalAlert }}
        </div>
        <p class="confirm-hint">Voulez-vous modifier votre sélection ou confirmer quand même ?</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="showExternalConfirm = false">Modifier</button>
        <button class="btn btn-primary" @click="showExternalConfirm = false; doServe()">Confirmer quand même</button>
      </div>
    </BaseModal>

    <!-- Confirmation service complexe -->
    <BaseModal title="Prestation complexe" v-if="showHeavyConfirm" @close="showHeavyConfirm = false">
      <div class="modal-body">
        <div class="warn-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          {{ heavyAlert }}
        </div>
        <p class="confirm-hint">Voulez-vous modifier votre sélection ou confirmer quand même ?</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="showHeavyConfirm = false">Modifier</button>
        <button class="btn btn-primary" @click="doServe">Enregistrer quand même</button>
      </div>
    </BaseModal>
  </BaseModal>
</template>

<style scoped>
/* ── Client banner ── */
.client-banner { display: flex; align-items: center; gap: 13px; padding: 13px 15px; background: var(--bg-soft); border: 1px solid var(--border); border-radius: 13px; }
.client-avatar { width: 44px; height: 44px; border-radius: 50%; background: var(--primary-soft); color: var(--primary); font-size: 18px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 0 0 2px var(--primary-mid); }
.client-name { font-size: 14px; font-weight: 700; color: var(--text-main); }
.client-meta { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; }

/* ── Lines ── */
.lines-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }

.line-card {
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 8px;
}

.line-top {
  display: grid; grid-template-columns: 22px 1fr 28px;
  align-items: center; gap: 8px;
}
.line-bottom {
  display: grid; grid-template-columns: 1fr 110px;
  align-items: center; gap: 8px;
  padding-left: 30px;
}

.line-num { width: 22px; height: 22px; border-radius: 50%; background: var(--primary-soft); color: var(--primary); font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.remove-placeholder { width: 28px; flex-shrink: 0; }
.field-service { min-width: 0; }
.field-staff   { min-width: 0; }

.price-wrap {
  position: relative; display: flex; align-items: center;
}
.price-input {
  width: 100%; padding: 8px 28px 8px 10px;
  border: 1px solid var(--input-border); border-radius: 8px;
  font-size: 13px; font-family: inherit; font-weight: 600;
  background: var(--input-bg); color: var(--input-text);
  transition: border-color .15s;
  -moz-appearance: textfield;
}
.price-input::-webkit-inner-spin-button,
.price-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.price-input:focus { outline: none; border-color: var(--primary); }
.price-suffix {
  position: absolute; right: 9px;
  font-size: 10.5px; font-weight: 700;
  color: var(--text-muted); pointer-events: none;
  user-select: none;
}

/* ── Actions ── */
.remove-line-btn { width: 28px; height: 28px; flex-shrink: 0; border: 1px solid rgba(220,38,38,.25); background: transparent; border-radius: 7px; color: var(--red); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .12s; }
.remove-line-btn:hover { background: var(--red-soft); }

.add-line-btn { display: flex; align-items: center; gap: 6px; border: 1.5px dashed var(--border-strong); background: transparent; border-radius: 10px; padding: 9px 14px; font-size: 13px; font-weight: 600; color: var(--text-muted); cursor: pointer; width: 100%; transition: all .12s; font-family: inherit; }
.add-line-btn:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-soft); }

/* ── Hint / warn ── */
.hint-box { display: flex; align-items: flex-start; gap: 8px; padding: 10px 13px; background: var(--blue-soft); border: 1px solid rgba(29,78,216,.2); border-radius: 10px; color: var(--blue); font-size: 13px; line-height: 1.45; }
.hint-box svg { flex-shrink: 0; margin-top: 1px; color: var(--blue); }
.confirm-hint { font-size: 13px; color: var(--text-muted); margin-top: 8px; line-height: 1.5; }
</style>

