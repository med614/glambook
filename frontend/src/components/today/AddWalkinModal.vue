<script setup>
import { ref, computed, onMounted } from 'vue'
import BaseModal from '../modal/BaseModal.vue'
import { supabase } from '@/lib/supabase'
import { fetchAllClients } from '../../services/clients.service'
import { getOrgId } from '@/composables/useOrgId'
import { fetchStaff } from '@/services/staff.service'
import { fetchServices, fetchServiceCategories } from '@/services/services.service'
import { formatPhone, isValidPhone } from '@/utils/phone'

const props = defineProps({
  today: { type: String, default: '' }
})
const emit = defineEmits(['close', 'refresh'])

// ── Données de base ──────────────────────────────────────────────────────────
const staffOptions    = ref([])
const serviceOptions  = ref([])
const categoryOptions = ref([])
const allClients      = ref([])
const busyStaffIds    = ref(new Set())
const loadedStaffIds  = ref(new Set())

onMounted(async () => {
  const today = props.today || new Date().toLocaleDateString('en-CA')
  const [staffRes, servicesRes, catsRes, clientsRes, { data: inProgress }, { data: scheduled }] = await Promise.all([
    fetchStaff(),
    fetchServices(),
    fetchServiceCategories(),
    fetchAllClients(),
    supabase.from('appointments').select('appointment_services(staff_id)')
      .eq('status', 'in_progress')
      .gte('start_time', today + 'T00:00:00').lte('start_time', today + 'T23:59:59'),
    supabase.from('appointments').select('appointment_services(staff_id)')
      .in('status', ['scheduled', 'waiting'])
      .gte('start_time', today + 'T00:00:00').lte('start_time', today + 'T23:59:59')
  ])
  staffOptions.value    = staffRes.filter(s => s.is_active)
  serviceOptions.value  = servicesRes.filter(s => s.is_active)
  categoryOptions.value = catsRes.filter(c => c.is_active)
  allClients.value      = clientsRes
  const busyIds   = (inProgress || []).flatMap(a => (a.appointment_services || []).map(s => s.staff_id)).filter(Boolean)
  const loadedIds = (scheduled  || []).flatMap(a => (a.appointment_services || []).map(s => s.staff_id)).filter(Boolean)
  busyStaffIds.value   = new Set(busyIds)
  loadedStaffIds.value = new Set(loadedIds)
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
function newLine() { return { id: Date.now(), serviceId: null, staffId: null, staffOpen: false, price: null } }
const lines = ref([newLine()])

function addLine()        { lines.value.push(newLine()) }
function removeLine(id)   { if (lines.value.length > 1) lines.value = lines.value.filter(l => l.id !== id) }

function staffGridFor(line) {
  const svc   = serviceOptions.value.find(s => s.id === line.serviceId)
  const catId = svc?.category_id
  const enriched = staffOptions.value.map(s => {
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

function selectedStaffInfo(line) {
  return staffGridFor(line).find(s => s.id === line.staffId) || null
}

function toggleStaff(line) { line.staffOpen = !line.staffOpen }
function closeStaff(line)  { line.staffOpen = false }
function pickStaff(line, id) { line.staffId = id; line.staffOpen = false }

// ── Soumission ───────────────────────────────────────────────────────────────
const isLoading   = ref(false)
const heavyAlert       = ref('')
const showHeavyConfirm = ref(false)

function getHeavyWarning() {
  for (const line of lines.value) {
    const svc = serviceOptions.value.find(s => s.id === line.serviceId)
    if (!svc?.is_heavy) continue
    if (!line.staffId) return `"${svc.name}" est une prestation complexe — aucun collaborateur compétent n'est affecté.`
    const staff = staffOptions.value.find(s => s.id === line.staffId)
    if (!staff?.categories?.some(c => c.id === svc.category_id))
      return `"${svc.name}" est une prestation complexe — ${staff?.name || 'ce collaborateur'} n'a pas la compétence requise.`
  }
  return ''
}

const canSubmit = computed(() => {
  if (!finalName.value.length) return false
  if (newClientMode.value && phoneError.value) return false
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
      ? props.today + 'T' + now.toTimeString().substring(0, 8)
      : now.toLocaleDateString('en-CA') + 'T' + now.toTimeString().substring(0, 8)

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

    const apptPayload = {
      organization_id: await getOrgId(),
      type:   'walkin',
      status: 'waiting',
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

    // ── Lier les prestations ────────────────────────────────────────
    const allLines = lines.value.filter(l => l.serviceId)
    if (allLines.length) {
      const { error: svcErr } = await supabase.from('appointment_services').insert(
        allLines.map(l => ({
          appointment_id:   appt.id,
          service_id:       l.serviceId,
          staff_id:         l.staffId || null,
          price_at_booking: l.price != null && l.price !== '' ? Number(l.price) : null
        }))
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
  <BaseModal @close="$emit('close')">
    <header class="modal-title">Nouveau sans RDV</header>

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
          <div v-for="(line, idx) in lines" :key="line.id" class="line-row">
            <div class="line-num">{{ idx + 1 }}</div>

            <!-- Service -->
            <select class="line-select" v-model="line.serviceId" @change="line.price = serviceOptions.find(s => s.id === line.serviceId)?.price ?? null">
              <option :value="null">Prestation (optionnel)</option>
              <option v-for="s in serviceOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>

            <!-- Staff -->
            <div class="staff-select" :class="{ open: line.staffOpen }">
              <button type="button" class="staff-trigger" @click="toggleStaff(line)">
                <template v-if="line.staffId">
                  <span class="avail-dot" :class="selectedStaffInfo(line)?.busy ? 'dot-busy' : selectedStaffInfo(line)?.loaded ? 'dot-loaded' : 'dot-free'"></span>
                  <span class="trigger-name">{{ selectedStaffInfo(line)?.name }}</span>
                </template>
                <span v-else class="trigger-placeholder">Collaborateur</span>
                <svg class="trigger-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div v-if="line.staffOpen" class="staff-dropdown" @mouseleave="closeStaff(line)">
                <button type="button" class="staff-option" @click="pickStaff(line, null)">
                  <span style="color:var(--text-muted);font-size:13px">Premier disponible</span>
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
            <button v-if="lines.length > 1" type="button" class="remove-line-btn" @click="removeLine(line.id)" title="Supprimer">
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
      <button class="btn btn-primary" :disabled="!canSubmit || isLoading" @click="handleAdd">
        {{ isLoading ? 'Ajout…' : 'Ajouter à la file' }}
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
        <button class="btn btn-primary" @click="doAdd">Confirmer quand même</button>
      </div>
    </BaseModal>
  </BaseModal>
</template>

<style scoped>
/* ── Client ── */
.client-search-area { display: flex; flex-direction: column; gap: 8px; }
.search-row { display: flex; gap: 8px; align-items: center; position: relative; }
.new-client-icon-btn {
  flex-shrink: 0; width: 38px; height: 38px;
  border: 1.5px solid var(--primary); border-radius: 9px;
  background: var(--primary-soft); color: var(--primary);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all .15s;
}
.new-client-icon-btn:hover { background: var(--primary); color: #fff; }
.quick-name-input {
  width: 100%; padding: 9px 12px; border: 1.5px dashed var(--border);
  border-radius: 9px; font-size: 13px; background: #f8fafc; color: var(--text-muted);
}
.quick-name-input:focus { outline: none; border-color: var(--primary); border-style: solid; color: var(--text-main); }
.search-input-wrap  { position: relative; width: 100%; }
.search-input-icon  { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
.search-input-wrap input { width: 100%; padding: 9px 12px 9px 32px; border: 1.5px solid var(--border); border-radius: 9px; font-size: 13.5px; background: #f8fafc; }
.search-input-wrap input:focus { outline: none; border-color: var(--primary); background: #fff; }

.client-dropdown {
  position: absolute; top: calc(100% + 4px); left: 0; right: 46px;
  background: #fff; border: 1px solid #1e293b; border-radius: 10px;
  box-shadow: 0 10px 25px rgba(0,0,0,.12); z-index: 9999; overflow: hidden;
}
.client-option { display: flex; align-items: center; gap: 10px; padding: 10px 14px; cursor: pointer; transition: background .12s; border-bottom: 1px solid var(--border); }
.client-option:last-child { border-bottom: none; }
.client-option:hover { background: var(--bg-main); }
.option-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--primary-soft); color: var(--primary-text); font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.option-avatar.avatar-flagged { background: #fef3c7; color: #b45309; }
.option-name  { font-size: 13.5px; font-weight: 600; color: var(--text-main); }
.option-phone { font-size: 11.5px; color: var(--text-muted); }
.flag-badge { font-size: 10px; font-weight: 700; background: #fef3c7; color: #b45309; border: 1px solid #fcd34d; border-radius: 999px; padding: 1px 6px; white-space: nowrap; flex-shrink: 0; }

.selected-client { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--primary-soft); border: 1px solid var(--primary); border-radius: 8px; }
.selected-client.selected-flagged { background: #fffbeb; border-color: #fcd34d; }
.selected-client-info { display: flex; align-items: center; gap: 10px; }
.selected-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--primary); color: #fff; font-size: 15px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.selected-avatar.avatar-flagged { background: #f59e0b; }
.selected-name  { font-size: 14px; font-weight: 700; color: var(--text-main); }
.selected-phone { font-size: 12px; color: var(--text-muted); margin-top: 1px; }
.clear-btn { background: transparent; border: none; cursor: pointer; color: var(--text-muted); padding: 4px; border-radius: 4px; display: flex; align-items: center; }
.clear-btn:hover { color: var(--text-main); }

.new-client-btn {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 9px 12px; border: 1.5px dashed var(--border); border-radius: 9px;
  background: transparent; font-size: 13px; font-weight: 600; color: var(--text-muted);
  cursor: pointer; transition: all .12s;
}
.new-client-btn:hover { border-color: var(--primary); color: var(--primary); background: #eff6ff; }

.new-client-form {
  border: 1.5px solid var(--primary); border-radius: 10px;
  background: var(--primary-soft); overflow: hidden;
}
.new-client-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid var(--border);
}
.new-client-title { font-size: 12.5px; font-weight: 700; color: var(--primary); }
.new-client-fields { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; }
.nc-input {
  width: 100%; padding: 8px 11px; border: 1.5px solid var(--border); border-radius: 8px;
  font-size: 13px; background: #fff;
}
.nc-input:focus { outline: none; border-color: var(--primary); }
.nc-input-error { border-color: #dc2626 !important; }
.nc-error { font-size: 11.5px; color: #dc2626; margin-top: 3px; display: block; }

/* ── Lignes de prestations ── */
.lines-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }

.line-row { display: flex; align-items: center; gap: 8px; }

.line-num { width: 22px; height: 22px; border-radius: 50%; background: var(--primary-soft); color: var(--primary-text); font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

.line-select {
  flex: 1; min-width: 0;
  padding: 8px 10px; border: 1.5px solid var(--border); border-radius: 9px;
  font-size: 13px; background: #f8fafc; color: var(--text-main);
  cursor: pointer;
}
.line-select:focus { outline: none; border-color: var(--primary); }

.price-inline-wrap { position: relative; width: 80px; flex-shrink: 0; }
.price-inline-input { width: 100%; padding: 7px 26px 7px 8px; border: 1.5px solid var(--border); border-radius: 9px; font-size: 12.5px; font-family: inherit; color: var(--text-main); background: #f8fafc; box-sizing: border-box; }
.price-inline-input:focus { outline: none; border-color: var(--primary); }
.price-inline-suffix { position: absolute; right: 7px; top: 50%; transform: translateY(-50%); font-size: 10px; color: var(--text-muted); pointer-events: none; font-weight: 700; }

.remove-line-btn { width: 28px; height: 28px; flex-shrink: 0; border: 1.5px solid #fca5a5; background: transparent; border-radius: 7px; color: #dc2626; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .12s; }
.remove-line-btn:hover { background: #fee2e2; }

.add-line-btn { display: flex; align-items: center; gap: 6px; border: 1.5px dashed var(--border); background: transparent; border-radius: 9px; padding: 8px 14px; font-size: 13px; font-weight: 600; color: var(--text-muted); cursor: pointer; width: 100%; transition: all .12s; }
.add-line-btn:hover { border-color: var(--primary); color: var(--primary); background: #eff6ff; }

/* ── Staff dropdown (par ligne) ── */
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

.avail-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot-free   { background: #22c55e; }
.dot-loaded { background: #f59e0b; }
.dot-busy   { background: #3b82f6; }

.heavy-alert {
  display: flex; align-items: flex-start; gap: 9px;
  background: #fffbeb; border: 1.5px solid #fbbf24;
  border-radius: 10px; padding: 11px 14px;
  font-size: 13px; font-weight: 600; color: #92400e;
  margin: 4px 0;
}
.heavy-alert svg { flex-shrink: 0; margin-top: 1px; color: #f59e0b; }
.confirm-hint { font-size: 13px; color: var(--text-muted); margin-top: 10px; line-height: 1.5; }
</style>
