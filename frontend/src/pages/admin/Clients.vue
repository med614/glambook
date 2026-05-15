<script setup>
import { ref, onMounted, computed } from 'vue'
import { fetchAllClients, deleteClient, clearClientFlag } from '../../services/clients.service'
import { fetchSettings } from '@/services/settings.service'
import { formatPhone } from '@/utils/phone'
import DropdownActions from '../../components/common/DropdownActions.vue'
import ClientModal from '../../components/admin/ClientModal.vue'
import ConfirmModal from '../../components/common/ConfirmModal.vue'

const clients = ref([])
const loading = ref(true)
const noshowThreshold = ref(3)
const cancelThreshold = ref(5)
const searchQuery = ref('')
const showFlaggedOnly = ref(false)
const showModal = ref(false)
const showConfirmDelete = ref(false)
const selectedClient = ref(null)

const flaggedCount = computed(() => clients.value.filter(c => isClientFlagged(c)).length)

onMounted(async () => {
  const settings = await fetchSettings().catch(() => null)
  if (settings) {
    noshowThreshold.value = settings.noshow_threshold ?? 3
    cancelThreshold.value = settings.cancel_threshold ?? 5
  }
  await loadClients()
})

async function loadClients() {
  loading.value = true
  try {
    clients.value = await fetchAllClients()
  } catch (err) {
    console.error('Erreur chargement clients:', err)
  } finally {
    loading.value = false
  }
}

function isClientFlagged(client) {
  const noshow = client.no_show_count || 0
  const cancelled = client.cancelled_count || 0
  return noshow >= noshowThreshold.value || cancelled >= cancelThreshold.value || client.is_flagged
}

const filteredClients = computed(() => {
  let list = clients.value
  if (showFlaggedOnly.value) list = list.filter(c => isClientFlagged(c))
  if (!searchQuery.value) return list
  const q = searchQuery.value.toLowerCase().replace(/\s/g, '')
  return list.filter(c => {
    const nameStr = (c.name || '').toLowerCase().replace(/\s/g, '')
    const lastNameStr = (c.last_name || '').toLowerCase().replace(/\s/g, '')
    const fullNameStr = nameStr + lastNameStr
    const phoneStr = (c.phone || '').replace(/\s/g, '')
    return fullNameStr.includes(q) || phoneStr.includes(q) || nameStr.includes(q) || lastNameStr.includes(q)
  })
})

async function clearFlag(client) {
  const currentBadCount = (client.no_show_count || 0) + (client.cancelled_count || 0)
  await clearClientFlag(client.id, currentBadCount)
  await loadClients()
}

function openModal(client = null) {
  selectedClient.value = client
  showModal.value = true
}

function onClientSaved() {
  showModal.value = false
  loadClients()
}

function prepareDelete(client) {
  selectedClient.value = client
  showConfirmDelete.value = true
}

async function handleDelete() {
  if (!selectedClient.value) return
  try {
    await deleteClient(selectedClient.value.id)
    showConfirmDelete.value = false
    await loadClients()
  } catch {
    alert("Impossible de supprimer ce client. Il est lié à des rendez-vous existants.")
    showConfirmDelete.value = false
  }
}

function initials(name) {
  return name ? name.charAt(0).toUpperCase() : '?'
}
</script>

<template>
  <div class="page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Clients</h1>
        <p class="page-desc">{{ clients.length }} client{{ clients.length !== 1 ? 's' : '' }} dans la base</p>
      </div>
      <button class="btn btn-primary" @click="openModal()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Ajouter un client
      </button>
    </div>

    <!-- Search + filtres -->
    <div class="filters-bar">
      <div class="search-input-wrap" style="width:320px;">
        <svg class="search-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input v-model="searchQuery" type="text" placeholder="Rechercher par nom ou téléphone…" />
      </div>

      <button
        class="btn"
        :class="showFlaggedOnly ? 'btn-danger-active' : 'btn-secondary'"
        @click="showFlaggedOnly = !showFlaggedOnly"
        style="display:flex;align-items:center;gap:7px;"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
        Signalés
        <span v-if="flaggedCount" class="flag-count">{{ flaggedCount }}</span>
      </button>
    </div>

    <!-- Table -->
    <div class="data-card">
      <!-- Loading -->
      <div v-if="loading" class="empty-state">
        <div class="page-spinner"></div>
        <p>Chargement des clients…</p>
      </div>

      <table v-else-if="filteredClients.length" class="table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Téléphone</th>
            <th>No-show / Annul.</th>
            <th>Ajouté le</th>
            <th style="width:56px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="client in filteredClients" :key="client.id">
            <td>
              <div style="display:flex;align-items:center;gap:12px;">
                <div class="avatar" style="position:relative;">
                  {{ initials(client.name) }}
                  <span v-if="isClientFlagged(client)" class="flag-dot" title="Client signalé"></span>
                </div>
                <div>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-weight:600;color:var(--text-main);">{{ client.name }} {{ client.last_name || '' }}</span>
                    <span v-if="isClientFlagged(client)" class="flag-badge">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                      Signalé
                    </span>
                  </div>
                  <div style="font-size:11px;color:var(--text-light);">#{{ client.id.split('-')[0] }}</div>
                </div>
              </div>
            </td>
            <td>
              <span class="phone-chip">{{ formatPhone(client.phone, true) }}</span>
            </td>
            <td>
              <div style="display:flex;align-items:center;gap:8px;">
                <span v-if="client.no_show_count" class="stat-badge no-show">{{ client.no_show_count }} absent{{ client.no_show_count > 1 ? 's' : '' }}</span>
                <span v-if="client.cancelled_count" class="stat-badge cancelled">{{ client.cancelled_count }} annul.</span>
                <span v-if="!client.no_show_count && !client.cancelled_count" style="color:var(--text-light);font-size:13px;">—</span>
              </div>
            </td>
            <td style="color:var(--text-muted);font-size:13px;">
              {{ new Date(client.created_at).toLocaleDateString('fr-FR') }}
            </td>
            <td>
              <DropdownActions
                :actions="[
                  { label: 'Modifier', icon: 'edit', onClick: () => openModal(client) },
                  ...(isClientFlagged(client) ? [{ label: 'Effacer le signalement', icon: 'x', onClick: () => clearFlag(client) }] : []),
                  { label: 'Supprimer', icon: 'trash', onClick: () => prepareDelete(client), class: 'danger' }
                ]"
              />
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else-if="!loading" class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-light)">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
        </svg>
        <p>Aucun client trouvé.</p>
      </div>
    </div>

    <ClientModal v-if="showModal" :client="selectedClient" @close="showModal = false" @saved="onClientSaved" />
    <ConfirmModal
      :open="showConfirmDelete"
      title="Supprimer le client"
      :message="`Êtes-vous sûr de vouloir supprimer ${selectedClient?.name} ? Cette action est irréversible.`"
      confirmText="Supprimer définitivement"
      @close="showConfirmDelete = false"
      @confirm="handleDelete"
    />
  </div>
</template>

<style scoped>
.phone-chip {
  display: inline-flex;
  align-items: center;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 3px 9px;
  font-size: 12.5px;
  color: var(--text-muted);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.page-spinner {
  width: 24px;
  height: 24px;
  border: 2.5px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.flag-dot {
  position: absolute;
  top: -2px; right: -2px;
  width: 10px; height: 10px;
  background: #ef4444;
  border-radius: 50%;
  border: 2px solid #fff;
}

.flag-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  padding: 2px 7px;
  border-radius: 999px;
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fca5a5;
}

.stat-badge.no-show   { background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; border-radius: 999px; font-size: 11px; font-weight: 700; padding: 2px 8px; }
.stat-badge.cancelled { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; border-radius: 999px; font-size: 11px; font-weight: 700; padding: 2px 8px; }

.btn-danger-active {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fca5a5;
}

.flag-count {
  background: #dc2626;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  min-width: 18px;
  text-align: center;
}

@media (max-width: 640px) {
  .table thead th:nth-child(3),
  .table tbody td:nth-child(3),
  .table thead th:nth-child(4),
  .table tbody td:nth-child(4) { display: none; }
}
</style>
