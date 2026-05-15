<script setup>
import { ref, computed, onMounted } from 'vue'
import BaseModal from '../modal/BaseModal.vue'
import { supabase } from '@/lib/supabase'

const props = defineProps({
  walkin:   { type: Object, required: true },
  staff:    { type: Array, default: () => [] },
  services: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'refresh'])

const isLoading      = ref(false)
const busyStaffIds   = ref(new Set())
const loadedStaffIds = ref(new Set())

onMounted(async () => {
  const today = new Date().toLocaleDateString('en-CA')
  const [{ data: inProgress }, { data: scheduled }] = await Promise.all([
    supabase.from('appointments').select('appointment_services(staff_id)')
      .eq('status', 'in_progress')
      .gte('start_time', today + 'T00:00:00').lte('start_time', today + 'T23:59:59'),
    supabase.from('appointments').select('appointment_services(staff_id)')
      .in('status', ['scheduled', 'waiting'])
      .gte('start_time', today + 'T00:00:00').lte('start_time', today + 'T23:59:59')
  ])
  busyStaffIds.value   = new Set((inProgress || []).flatMap(a => (a.appointment_services || []).map(s => s.staff_id)).filter(Boolean))
  loadedStaffIds.value = new Set((scheduled  || []).flatMap(a => (a.appointment_services || []).map(s => s.staff_id)).filter(Boolean))
})

// ── Lignes de prestations ────────────────────────────────────────────────────
function newLine() { return { id: Date.now() + Math.random(), serviceId: null, staffId: null, staffOpen: false, price: null } }

// Pré-remplir depuis les appointment_services existants du walkin
const existingSvcs = props.walkin.raw?.appointment_services || []
const lines = ref(
  existingSvcs.length
    ? existingSvcs.map((s, i) => ({
        id:        i,
        svcRowId:  s.id,
        serviceId: s.service?.id || null,
        staffId:   s.staff?.id || null,
        staffOpen: false,
        price:     s.price_at_booking ?? props.services.find(sv => sv.id === s.service?.id)?.price ?? null
      }))
    : [newLine()]
)

function addLine()      { lines.value.push(newLine()) }
function removeLine(id) { if (lines.value.length > 1) lines.value = lines.value.filter(l => l.id !== id) }

function staffGridFor(line) {
  const svc    = props.services.find(s => s.id === line.serviceId)
  const catId  = svc?.category_id
  const enriched = props.staff.filter(s => s.is_active !== false).map(s => {
    const busy      = busyStaffIds.value.has(s.id)
    const loaded    = !busy && loadedStaffIds.value.has(s.id)
    const competent = !!(catId && s.categories?.some(c => c.id === catId))
    return { ...s, busy, loaded, competent }
  })
  const score = s => s.busy ? 2 : s.loaded ? 1 : 0
  const competent = enriched.filter(s => s.competent).sort((a, b) => score(a) - score(b))
  const others    = enriched.filter(s => !s.competent).sort((a, b) => score(a) - score(b))
  return competent.length && others.length
    ? [...competent, { id: '__sep__', _sep: true }, ...others]
    : [...competent, ...others]
}

function selectedStaffInfo(line) { return staffGridFor(line).find(s => s.id === line.staffId) || null }
function pickStaff(line, id)     { line.staffId = id; line.staffOpen = false }

// ── Soumission ───────────────────────────────────────────────────────────────
const heavyAlert       = ref('')
const showHeavyConfirm = ref(false)

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

const canSubmit = computed(() => lines.value.some(l => l.staffId))

async function handleServe() {
  if (!canSubmit.value) return
  const warn = getHeavyWarning()
  if (warn) { heavyAlert.value = warn; showHeavyConfirm.value = true; return }
  await doServe()
}

async function doServe() {
  showHeavyConfirm.value = false
  heavyAlert.value = ''
  isLoading.value = true
  try {
    const apptId   = props.walkin.id
    const firstLine = lines.value[0]

    // Passer l'appointment en in_progress avec le staff de la première ligne
    await supabase.from('appointments')
      .update({ status: 'in_progress', staff_id: firstLine.staffId })
      .eq('id', apptId)

    // Mettre à jour ou insérer chaque ligne
    for (const line of lines.value) {
      if (line.svcRowId) {
        // Ligne existante → update
        await supabase.from('appointment_services')
          .update({ service_id: line.serviceId, staff_id: line.staffId })
          .eq('id', line.svcRowId)
      } else if (line.serviceId || line.staffId) {
        // Nouvelle ligne → insert
        await supabase.from('appointment_services')
          .insert({ appointment_id: apptId, service_id: line.serviceId, staff_id: line.staffId, price_at_booking: line.price != null && line.price !== '' ? Number(line.price) : null })
      }
    }

    emit('refresh')
    emit('close')
  } catch (e) {
    console.error('Error serving walkin:', e)
    alert('Erreur : ' + (e.message || 'Impossible de lancer la prestation'))
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <BaseModal @close="$emit('close')">
    <header class="modal-title">Lancer la prestation</header>

    <div class="modal-body">

      <!-- Bannière client -->
      <div class="walkin-client-banner">
        <div class="walkin-avatar">{{ walkin.client?.charAt(0)?.toUpperCase() || '?' }}</div>
        <div>
          <div class="walkin-client-name">{{ walkin.client }}</div>
          <div class="walkin-client-meta">Arrivée {{ walkin.time }}</div>
        </div>
      </div>

      <!-- Lignes prestations -->
      <div class="form-group">
        <label>Prestations</label>

        <div class="lines-list">
          <div v-for="(line, idx) in lines" :key="line.id" class="line-row">
            <div class="line-num">{{ idx + 1 }}</div>

            <!-- Service -->
            <select class="line-select" v-model="line.serviceId" @change="line.price = services.find(s => s.id === line.serviceId)?.price ?? null">
              <option :value="null">Prestation (optionnel)</option>
              <option v-for="s in services" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>

            <!-- Staff -->
            <div class="staff-select" :class="{ open: line.staffOpen }">
              <button type="button" class="staff-trigger" @click="line.staffOpen = !line.staffOpen">
                <template v-if="line.staffId">
                  <span class="avail-dot" :class="selectedStaffInfo(line)?.busy ? 'dot-busy' : selectedStaffInfo(line)?.loaded ? 'dot-loaded' : 'dot-free'"></span>
                  <span class="trigger-name">{{ selectedStaffInfo(line)?.name }}</span>
                </template>
                <span v-else class="trigger-placeholder">Collaborateur *</span>
                <svg class="trigger-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div v-if="line.staffOpen" class="staff-dropdown">
                <button type="button" class="staff-option" @click="pickStaff(line, null)">
                  <span style="color:var(--text-muted);font-size:13px">Non assigné</span>
                </button>
                <div class="staff-sep"></div>
                <template v-for="s in staffGridFor(line)" :key="s.id">
                  <div v-if="s._sep" class="staff-sep-label">Autres</div>
                  <button v-else type="button" class="staff-option" :class="{ 'opt-selected': line.staffId === s.id }" @click="pickStaff(line, s.id)">
                    <span class="avail-dot" :class="s.busy ? 'dot-busy' : s.loaded ? 'dot-loaded' : 'dot-free'"></span>
                    <span class="option-name">{{ s.name }}</span>
                    <svg v-if="line.staffId === s.id" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-left:auto;flex-shrink:0;color:var(--primary)"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                </template>
              </div>
            </div>

            <!-- Prix -->
            <div class="price-inline-wrap">
              <input v-model="line.price" type="number" min="0" step="1" placeholder="—" class="price-inline-input" />
              <span class="price-inline-suffix">DH</span>
            </div>

            <!-- Supprimer -->
            <button v-if="lines.length > 1" type="button" class="remove-line-btn" @click="removeLine(line.id)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div v-else style="width:28px;flex-shrink:0"></div>
          </div>
        </div>

        <button type="button" class="add-line-btn" @click="addLine">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Ajouter une prestation
        </button>
      </div>

    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" @click="$emit('close')">Annuler</button>
      <button class="btn btn-primary" :disabled="!canSubmit || isLoading" @click="handleServe">
        {{ isLoading ? 'Lancement…' : 'Lancer' }}
      </button>
    </div>

    <!-- Confirmation service complexe -->
    <BaseModal v-if="showHeavyConfirm" @close="showHeavyConfirm = false">
      <header class="modal-title">Prestation complexe</header>
      <div class="modal-body">
        <div class="heavy-alert">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          {{ heavyAlert }}
        </div>
        <p class="confirm-hint">Voulez-vous modifier votre sélection ou confirmer quand même ?</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="showHeavyConfirm = false">Modifier</button>
        <button class="btn btn-primary" @click="doServe">Confirmer quand même</button>
      </div>
    </BaseModal>
  </BaseModal>
</template>

<style scoped>
.walkin-client-banner { display: flex; align-items: center; gap: 14px; padding: 14px; background: var(--bg-main); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 4px; }
.walkin-avatar { width: 44px; height: 44px; border-radius: 50%; background: var(--primary-soft); color: var(--primary-text); font-size: 18px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.walkin-client-name { font-size: 15px; font-weight: 600; color: var(--text-main); }
.walkin-client-meta { font-size: 12.5px; color: var(--text-muted); margin-top: 2px; }

.lines-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.line-row   { display: flex; align-items: center; gap: 8px; }
.line-num   { width: 22px; height: 22px; border-radius: 50%; background: var(--primary-soft); color: var(--primary-text); font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

.line-select { flex: 1; min-width: 0; padding: 8px 10px; border: 1.5px solid var(--border); border-radius: 9px; font-size: 13px; background: #f8fafc; color: var(--text-main); cursor: pointer; }
.line-select:focus { outline: none; border-color: var(--primary); }

.price-inline-wrap { position: relative; width: 80px; flex-shrink: 0; }
.price-inline-input { width: 100%; padding: 7px 26px 7px 8px; border: 1.5px solid var(--border); border-radius: 9px; font-size: 12.5px; font-family: inherit; color: var(--text-main); background: #f8fafc; box-sizing: border-box; }
.price-inline-input:focus { outline: none; border-color: var(--primary); }
.price-inline-suffix { position: absolute; right: 7px; top: 50%; transform: translateY(-50%); font-size: 10px; color: var(--text-muted); pointer-events: none; font-weight: 700; }

.remove-line-btn { width: 28px; height: 28px; flex-shrink: 0; border: 1.5px solid #fca5a5; background: transparent; border-radius: 7px; color: #dc2626; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .12s; }
.remove-line-btn:hover { background: #fee2e2; }

.add-line-btn { display: flex; align-items: center; gap: 6px; border: 1.5px dashed var(--border); background: transparent; border-radius: 9px; padding: 8px 14px; font-size: 13px; font-weight: 600; color: var(--text-muted); cursor: pointer; width: 100%; transition: all .12s; }
.add-line-btn:hover { border-color: var(--primary); color: var(--primary); background: #eff6ff; }

.staff-select { position: relative; flex: 1; min-width: 0; }
.staff-trigger { display: flex; align-items: center; gap: 7px; width: 100%; padding: 8px 10px; border: 1.5px solid var(--border); border-radius: 9px; background: #f8fafc; cursor: pointer; font-size: 13px; text-align: left; transition: border-color .15s; }
.staff-trigger:hover, .staff-select.open .staff-trigger { border-color: var(--primary); background: #fff; }
.trigger-name        { flex: 1; font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.trigger-placeholder { flex: 1; color: var(--text-muted); }
.trigger-chevron { flex-shrink: 0; color: var(--text-muted); transition: transform .2s; }
.staff-select.open .trigger-chevron { transform: rotate(180deg); }

.staff-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: #fff; border: 1.5px solid var(--border); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.1); z-index: 200; overflow: hidden; max-height: 220px; overflow-y: auto; }
.staff-sep       { height: 1px; background: var(--border); margin: 2px 0; }
.staff-sep-label { padding: 4px 12px; font-size: 11px; font-weight: 600; color: var(--text-muted); background: var(--bg-main); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); letter-spacing: .04em; text-transform: uppercase; }
.staff-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: none; background: transparent; cursor: pointer; text-align: left; transition: background .1s; }
.staff-option:hover { background: #f8fafc; }
.staff-option.opt-selected { background: #eff6ff; }
.option-name { flex: 1; font-size: 13px; font-weight: 600; color: var(--text-main); }

.heavy-alert { display: flex; align-items: flex-start; gap: 8px; padding: 10px 13px; background: #fffbeb; border: 1.5px solid #f59e0b; border-radius: 9px; color: #92400e; font-size: 13px; line-height: 1.45; }
.heavy-alert svg { flex-shrink: 0; margin-top: 1px; color: #f59e0b; }
.confirm-hint { font-size: 13px; color: var(--text-muted); margin-top: 10px; line-height: 1.5; }

.avail-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot-free   { background: #22c55e; }
.dot-loaded { background: #f59e0b; }
.dot-busy   { background: #3b82f6; }
</style>
