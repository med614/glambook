<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import BaseModal from '../modal/BaseModal.vue'
import CustomSelect from '@/components/common/CustomSelect.vue'
import { supabase } from '@/lib/supabase'
import { fetchAllClients } from '../../services/clients.service'
import { getOrgId } from '@/composables/useOrgId'
import { fetchServices, fetchServiceCategories } from '@/services/services.service'
import { formatPhone, isValidPhone } from '@/utils/phone'
import { rankStaff } from '@/composables/useStaffRanking'

const props = defineProps({
  today:        { type: String, default: '' },
  staff:        { type: Array,  default: () => [] },
  services:     { type: Array,  default: () => [] },
  appointments: { type: Array,  default: () => [] }
})
const emit = defineEmits(['close', 'refresh'])

// ── Données de base ──────────────────────────────────────────────────────────
const serviceOptions  = ref([])
const categoryOptions = ref([])
const allClients      = ref([])

const staffOptions = computed(() => props.staff.filter(s => s.is_active !== false))

onMounted(async () => {
  const [servicesRes, catsRes, clientsRes] = await Promise.all([
    fetchServices(),
    fetchServiceCategories(),
    fetchAllClients()
  ])
  serviceOptions.value  = servicesRes.filter(s => s.is_active)
  categoryOptions.value = catsRes.filter(c => c.is_active)
  allClients.value      = clientsRes
})

// ── Client ───────────────────────────────────────────────────────────────────
const clientSearch     = ref('')
const selectedClientId = ref(null)
const showDropdown     = ref(false)
const quickName        = ref('')      // nom rapide sans fiche

// Mode nouveau client (avec fiche)
const newClientMode  = ref(false)
const newClientFirst = ref('')
const newClientLast  = ref('')
const newClientPhone = ref('')

const phoneError = computed(() => {
  if (!newClientMode.value) return null
  if (!newClientPhone.value.trim()) return 'Le téléphone est obligatoire'
  if (!isValidPhone(newClientPhone.value)) return 'Format invalide (ex: 06 12 34 56 78)'
  return null
})

const filteredClients = computed(() => {
  if (!clientSearch.value.trim()) return allClients.value.slice(0, 8)
  const q = clientSearch.value.toLowerCase().replace(/\s/g, '')
  return allClients.value.filter(c => {
    const full  = ((c.name || '') + (c.last_name || '')).toLowerCase().replace(/\s/g, '')
    const phone = (c.phone || '').replace(/\s/g, '')
    return full.includes(q) || phone.includes(q)
  }).slice(0, 8)
})
const selectedClient = computed(() => allClients.value.find(c => c.id === selectedClientId.value))

function selectClient(c) {
  selectedClientId.value = c.id
  clientSearch.value = ''
  quickName.value = ''
  newClientMode.value = false
  showDropdown.value = false
}

function clearClient() {
  selectedClientId.value = null
  clientSearch.value = ''
  quickName.value = ''
  newClientMode.value = false
  newClientFirst.value = ''
  newClientLast.value = ''
  newClientPhone.value = ''
}

function openNewClient() {
  newClientMode.value = true
  selectedClientId.value = null
  clientSearch.value = ''
  quickName.value = ''
  showDropdown.value = false
}

const finalName = computed(() => {
  if (selectedClient.value) return (selectedClient.value.name + ' ' + (selectedClient.value.last_name || '')).trim()
  if (newClientMode.value) return newClientFirst.value.trim()
  return quickName.value.trim()
})

// ── Lignes de prestations ────────────────────────────────────────────────────
function newLine() { return { id: Date.now() + Math.random(), serviceId: null, staffId: null, price: null, isParallel: false } }
const lines = ref([newLine()])

function addLine()        { lines.value.push(newLine()) }
function removeLine(id)   { if (lines.value.length > 1) lines.value = lines.value.filter(l => l.id !== id) }

// Auto-fill prix quand on change la prestation
watch(() => lines.value.map(l => l.serviceId), (newIds, oldIds) => {
  newIds.forEach((id, i) => {
    if (id && id !== oldIds?.[i]) {
      const svc = serviceOptions.value.find(s => s.id === id)
      if (svc?.price != null) lines.value[i].price = svc.price
    }
  })
})

// ── Ranking staff (même logique que RdvModal / ServeWalkinModal) ─────────────
function getRanked(serviceId) {
  const now = new Date()
  const targetTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
  const targetDate = now.toLocaleDateString('en-CA')
  // Utiliser les services de Today.vue (source unique) pour le ranking
  const rankingServices = props.services.length ? props.services : serviceOptions.value
  return rankStaff({
    staffList:    staffOptions.value,
    serviceId,
    services:     rankingServices,
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

// Force staff indisponible — même pattern que RdvModal
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
const isLoading   = ref(false)
const heavyAlert       = ref('')
const showHeavyConfirm = ref(false)

function getHeavyWarning() {
  for (const line of lines.value) {
    if (!line.staffId) continue  // staff optionnel à l'ajout — pas d'avertissement si absent
    const svc = serviceOptions.value.find(s => s.id === line.serviceId)
    if (!svc?.is_heavy) continue
    const staff = staffOptions.value.find(s => s.id === line.staffId)
    if (!staff?.categories?.some(c => c.id === svc.category_id))
      return `"${svc.name}" est une prestation complexe — ${staff?.name || 'ce collaborateur'} n'a pas la compétence requise.`
  }
  return ''
}

const missingService = computed(() => lines.value.some(l => l.staffId && !l.serviceId))

const canSubmit = computed(() => {
  if (!finalName.value.length) return false
  if (newClientMode.value && phoneError.value) return false
  if (missingService.value) return false
  return true
})

async function handleAdd() {
  if (!canSubmit.value) return
  const warn = getHeavyWarning()
  if (warn) { heavyAlert.value = warn; showHeavyConfirm.value = true; return }
  await doAdd()
}

async function doAdd() {
  showHeavyConfirm.value = false
  heavyAlert.value = ''
  isLoading.value = true
  try {
    const now = new Date()
    const startTime = props.today
      ? (() => { const [y, mo, d] = props.today.split('-').map(Number); return new Date(y, mo - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString() })()
      : new Date().toISOString()

    // ── Résoudre client_id ──────────────────────────────────────────
    let clientId = selectedClientId.value

    if (!clientId && newClientMode.value && newClientFirst.value.trim()) {
      // Nouveau client avec fiche → créer en base
      const phone = newClientPhone.value.replace(/\s/g, '')
      const { data: newC, error } = await supabase.from('clients').insert({
        name: newClientFirst.value.trim(),
        last_name: newClientLast.value.trim() || null,
        phone,
        organization_id: await getOrgId()
      }).select().single()
      if (error) throw error
      clientId = newC.id
    }

    // ── Créer l'appointment directement en Supabase ─────────────────
    // (bypass backend pour éviter la création automatique d'un client fantôme
    //  lors d'une saisie rapide sans fiche)
    const firstLine = lines.value[0]
    const isQuickName = !clientId  // saisie rapide sans fiche

    // Si au moins une prestation est déjà assignée à un staff, l'appointment
    // passe directement en in_progress (sinon waiting = en attente dans la file)
    const hasAssignedStaff = lines.value.some(l => l.serviceId && l.staffId)

    const apptPayload = {
      organization_id: await getOrgId(),
      type:   'walkin',
      status: hasAssignedStaff ? 'in_progress' : 'waiting',
      start_time: startTime,
      client_id:   clientId || null,
      walkin_name: isQuickName ? finalName.value : null
    }

    const { data: appt, error: apptErr } = await supabase
      .from('appointments')
      .insert(apptPayload)
      .select()
      .single()
    if (apptErr) throw apptErr

    // ── Lier les prestations avec start_time en cascade ─────────────
    const allLines = lines.value.filter(l => l.serviceId)
    if (allLines.length) {
      let runningTime = new Date(startTime)
      const { error: svcErr } = await supabase.from('appointment_services').insert(
        allLines.map(l => {
          const svcDef   = serviceOptions.value.find(s => s.id === l.serviceId)
          const svcStart = runningTime.toISOString()
          if (!l.isParallel) runningTime = new Date(runningTime.getTime() + (svcDef?.duration_minutes || 0) * 60000)
          return {
            appointment_id:   appt.id,
            service_id:       l.serviceId,
            staff_id:         l.staffId || null,
            price_at_booking: l.price != null && l.price !== '' ? Number(l.price) : null,
            is_parallel:      l.isParallel || false,
            start_time:       svcStart
          }
        })
      )
      if (svcErr) throw svcErr
    }

    emit('refresh')
    emit('close')
  } catch (e) {
    console.error('Error creating walkin:', e)
    alert('Erreur : ' + (e.response?.data?.error || e.message))
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <BaseModal title="Nouveau sans RDV" @close="$emit('close')">

    <div class="modal-body">

      <!-- ── Client ── -->
      <div class="form-group">
        <label>Client</label>

        <!-- Client sélectionné depuis la liste -->
        <div v-if="selectedClientId" class="selected-client" :class="{ 'selected-flagged': selectedClient?.is_flagged }">
          <div class="selected-client-info">
            <div class="selected-avatar" :class="{ 'avatar-flagged': selectedClient?.is_flagged }">{{ selectedClient?.name?.charAt(0).toUpperCase() }}</div>
            <div>
              <div class="selected-name" style="display:flex;align-items:center;gap:6px;">
                {{ selectedClient?.name }} {{ selectedClient?.last_name || '' }}
                <span v-if="selectedClient?.is_flagged" class="flag-badge">⚠ Signalé</span>
              </div>
              <div class="selected-phone">{{ selectedClient?.phone || 'Pas de téléphone' }}</div>
            </div>
          </div>
          <button type="button" class="clear-btn" @click="clearClient">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Nouveau client avec fiche -->
        <div v-else-if="newClientMode" class="new-client-form">
          <div class="new-client-header">
            <span class="new-client-title">Nouveau client</span>
            <button type="button" class="clear-btn" @click="clearClient">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="new-client-fields">
            <input v-model="newClientFirst" type="text" placeholder="Prénom *" class="nc-input" autofocus />
            <input v-model="newClientLast"  type="text" placeholder="Nom" class="nc-input" />
            <div>
              <input
                :value="newClientPhone"
                @input="newClientPhone = formatPhone($event.target.value)"
                type="tel" placeholder="06 12 34 56 78 *"
                class="nc-input" :class="{ 'nc-input-error': newClientPhone && !isValidPhone(newClientPhone) }"
              />
              <span v-if="phoneError" class="nc-error">{{ phoneError }}</span>
            </div>
          </div>
        </div>

        <!-- Recherche + saisie rapide -->
        <div v-else class="client-search-area">
          <!-- Ligne : recherche + bouton + créer fiche -->
          <div class="search-row" @focusout="e => { if (!e.currentTarget.contains(e.relatedTarget)) showDropdown = false }">
            <div class="search-input-wrap" style="flex:1;position:relative;">
              <svg class="search-input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input v-model="clientSearch" type="text" placeholder="Rechercher un client existant…" @focus="showDropdown = true" />
            </div>
            <button type="button" class="new-client-icon-btn" @click.stop="openNewClient" title="Créer un nouveau client">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <!-- Dropdown résultats -->
            <div v-if="showDropdown && clientSearch.trim() && filteredClients.length" class="client-dropdown">
              <div v-for="c in filteredClients" :key="c.id" class="client-option" @mousedown.prevent="selectClient(c)">
                <div class="option-avatar" :class="{ 'avatar-flagged': c.is_flagged }">{{ c.name?.charAt(0).toUpperCase() }}</div>
                <div style="flex:1;min-width:0;">
                  <div class="option-name" style="display:flex;align-items:center;gap:6px;">
                    {{ c.name }} {{ c.last_name || '' }}
                    <span v-if="c.is_flagged" class="flag-badge">⚠ Signalé</span>
                  </div>
                  <div class="option-phone">{{ c.phone || '—' }}</div>
                </div>
              </div>
            </div>
          </div>
          <!-- Nom rapide sans fiche -->
          <input v-model="quickName" type="text" class="quick-name-input" placeholder="— ou saisir un nom sans créer de fiche —" />
        </div>
      </div>

      <!-- ── Prestations ── -->
      <div class="form-group">
        <label>Prestations</label>

        <div class="lines-list">
          <div v-for="(line, idx) in lines" :key="line.id" class="line-card">
            <!-- Haut : numéro + service + supprimer -->
            <div class="line-top">
              <span class="line-num">{{ idx + 1 }}</span>
              <CustomSelect
                v-model="line.serviceId"
                :options="[{ id: null, name: 'Prestation (optionnel)' }, ...serviceOptions]"
                placeholder="Prestation…"
                :iconType="'none'"
                class="field-service"
              />
              <button v-if="lines.length > 1" type="button" class="remove-line-btn" @click="removeLine(line.id)" title="Supprimer">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div v-else class="remove-placeholder"></div>
            </div>
            <!-- Bas : staff + prix + toggle parallèle -->
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
              <label v-if="lines.length > 1" class="parallel-toggle" :title="line.isParallel ? 'Simultané avec la précédente' : 'Séquentiel'">
                <input type="checkbox" v-model="line.isParallel" />
                <span>⟺</span>
              </label>
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
      <button class="btn btn-primary" :disabled="!canSubmit || isLoading" @click="handleAdd">
        {{ isLoading ? 'Ajout…' : 'Ajouter à la file' }}
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
        <button class="btn btn-primary" @click="doAdd">Confirmer quand même</button>
      </div>
    </BaseModal>
  </BaseModal>
</template>

<style scoped>
/* ── Client search ── */
.client-search-area { display: flex; flex-direction: column; gap: 8px; }
.search-row { display: flex; gap: 8px; align-items: center; position: relative; }

.new-client-icon-btn {
  flex-shrink: 0; width: 38px; height: 38px;
  border: 1px solid var(--primary); border-radius: 9px;
  background: var(--primary-soft); color: var(--primary);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all .15s;
}
.new-client-icon-btn:hover { background: var(--primary-mid); }

.quick-name-input {
  width: 100%; padding: 9px 12px;
  border: 1.5px dashed var(--border-strong); border-radius: 9px;
  font-size: 13px; font-family: inherit;
  background: var(--input-bg); color: var(--text-muted);
  transition: border-color .15s, color .15s;
}
.quick-name-input:focus { outline: none; border-color: var(--primary); border-style: solid; color: var(--text-main); }
.quick-name-input::placeholder { color: var(--input-placeholder); }

.search-input-wrap { position: relative; width: 100%; }
.search-input-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
.search-input-wrap input {
  width: 100%; padding: 9px 12px 9px 32px;
  border: 1px solid var(--input-border); border-radius: 9px;
  font-size: 13.5px; font-family: inherit;
  background: var(--input-bg); color: var(--input-text);
}
.search-input-wrap input::placeholder { color: var(--input-placeholder); }
.search-input-wrap input:focus { outline: none; border-color: var(--primary); }

.client-dropdown {
  position: absolute; top: calc(100% + 4px); left: 0; right: 46px;
  background: var(--bg-card); border: 1px solid var(--border-strong); border-radius: 10px;
  box-shadow: var(--shadow-lg); z-index: 9999; overflow: hidden;
}
.client-option {
  display: flex; align-items: center; gap: 10px; padding: 10px 14px;
  cursor: pointer; transition: background .12s;
  border-bottom: 1px solid var(--border);
}
.client-option:last-child { border-bottom: none; }
.client-option:hover { background: var(--bg-soft); }
.option-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--primary-soft); color: var(--primary);
  font-size: 13px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.option-avatar.avatar-flagged { background: var(--orange-soft); color: var(--orange); }
.option-name  { font-size: 13.5px; font-weight: 600; color: var(--text-main); }
.option-phone { font-size: 11.5px; color: var(--text-muted); }
.flag-badge {
  font-size: 10px; font-weight: 700;
  background: var(--orange-soft); color: var(--orange);
  border: 1px solid rgba(217,119,6,.3); border-radius: 999px;
  padding: 1px 6px; white-space: nowrap; flex-shrink: 0;
}

/* ── Client sélectionné ── */
.selected-client {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px;
  background: var(--primary-soft); border: 1px solid rgba(168,129,10,.3);
  border-radius: 10px;
}
.selected-client.selected-flagged { background: var(--orange-soft); border-color: rgba(217,119,6,.3); }
.selected-client-info { display: flex; align-items: center; gap: 10px; }
.selected-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--primary-mid); color: var(--primary);
  font-size: 15px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.selected-avatar.avatar-flagged { background: var(--orange-soft); color: var(--orange); }
.selected-name  { font-size: 14px; font-weight: 700; color: var(--text-main); }
.selected-phone { font-size: 12px; color: var(--text-muted); margin-top: 1px; }
.clear-btn {
  background: transparent; border: none; cursor: pointer;
  color: var(--text-light); padding: 4px; border-radius: 4px;
  display: flex; align-items: center; transition: color .12s;
}
.clear-btn:hover { color: var(--text-main); }

/* ── Nouveau client form ── */
.new-client-form {
  border: 1px solid rgba(168,129,10,.35); border-radius: 10px;
  background: var(--primary-soft); overflow: hidden;
}
.new-client-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid var(--border);
}
.new-client-title { font-size: 12.5px; font-weight: 700; color: var(--primary); }
.new-client-fields { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; }
.nc-input {
  width: 100%; padding: 8px 11px;
  border: 1px solid var(--input-border); border-radius: 8px;
  font-size: 13px; font-family: inherit;
  background: var(--input-bg); color: var(--input-text);
  transition: border-color .15s;
}
.nc-input::placeholder { color: var(--input-placeholder); }
.nc-input:focus { outline: none; border-color: var(--primary); }
.nc-input-error { border-color: var(--red) !important; }
.nc-error { font-size: 11.5px; color: var(--red); margin-top: 3px; display: block; }

/* ── Lignes de prestations ── */
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
  display: grid; grid-template-columns: 1fr 110px auto;
  align-items: center; gap: 8px;
  padding-left: 30px;
}

.line-num {
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--primary-soft); color: var(--primary);
  font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
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

/* ── Parallel toggle ── */
.parallel-toggle {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; cursor: pointer; flex-shrink: 0;
  border: 1px solid var(--border); border-radius: 6px;
  font-size: 13px; color: var(--text-muted); transition: all .12s; user-select: none;
}
.parallel-toggle:has(input:checked) { border-color: var(--blue); background: var(--blue-soft); color: var(--blue); }
.parallel-toggle input { display: none; }

/* ── Buttons ── */
.remove-line-btn {
  width: 28px; height: 28px; flex-shrink: 0;
  border: 1px solid rgba(220,38,38,.25); background: transparent;
  border-radius: 7px; color: var(--red);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all .12s;
}
.remove-line-btn:hover { background: var(--red-soft); }

.add-line-btn {
  display: flex; align-items: center; gap: 6px;
  border: 1.5px dashed var(--border-strong); background: transparent;
  border-radius: 10px; padding: 9px 14px;
  font-size: 13px; font-weight: 600; color: var(--text-muted);
  cursor: pointer; width: 100%; transition: all .12s; font-family: inherit;
}
.add-line-btn:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-soft); }

.confirm-hint { font-size: 13px; color: var(--text-muted); line-height: 1.5; }
</style>

