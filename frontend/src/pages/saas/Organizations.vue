<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchOrganizations, createOrganization, updateOrganization, toggleOrganization } from '../../services/organizations.service'
import { authService } from '../../services/auth.service'
import { useRouter } from 'vue-router'
import OrganizationModal from '../../components/saas/OrganizationModal.vue'
import OrgDrawer from '../../components/saas/OrgDrawer.vue'

const router = useRouter()
const organizations = ref([])
const loading = ref(false)
const searchQuery = ref('')
const showModal = ref(false)
const selectedOrg = ref(null)
const drawerOrg = ref(null)

const totalActive   = computed(() => organizations.value.filter(o => o.is_active).length)
const totalInactive = computed(() => organizations.value.filter(o => !o.is_active).length)
const totalExpired  = computed(() => organizations.value.filter(o =>
  o.subscription?.paid_until && new Date(o.subscription.paid_until) < new Date()
).length)

const filteredOrgs = computed(() => {
  if (!searchQuery.value.trim()) return organizations.value
  const q = searchQuery.value.toLowerCase()
  return organizations.value.filter(o =>
    o.name?.toLowerCase().includes(q) || o.type?.toLowerCase().includes(q) || o.phone?.includes(q)
  )
})

async function load() {
  loading.value = true
  try {
    organizations.value = await fetchOrganizations()
  } finally {
    loading.value = false
  }
}

function openCreate() {
  selectedOrg.value = null
  showModal.value = true
}

function openEdit(org) {
  selectedOrg.value = org
  showModal.value = true
}

function openDrawer(org) {
  drawerOrg.value = org
}

async function onSaved() {
  showModal.value = false
  await load()
}

async function toggle(org) {
  await toggleOrganization(org.id, !org.is_active)
  await load()
}

function logout() {
  authService.logout()
  router.push('/login')
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function typeLabel(t) {
  return { salon: 'Salon', cabinet: 'Cabinet médical', spa: 'Spa', other: 'Autre' }[t] || t
}

onMounted(load)
</script>

<template>
  <div class="saas-layout">

    <!-- Topbar -->
    <header class="saas-topbar">
      <div class="saas-brand">
        <div class="saas-brand-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        </div>
        <div class="saas-brand-text">
          <span class="saas-brand-name">Glambook</span>
          <span class="saas-brand-tag">Administration</span>
        </div>
      </div>

      <nav class="saas-nav">
        <router-link to="/saas/organizations" class="saas-nav-link">Organisations</router-link>
        <router-link to="/saas/account" class="saas-nav-link">Mon compte</router-link>
      </nav>

      <div class="saas-topbar-right">
        <button class="saas-logout" @click="logout" title="Déconnexion">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Déconnexion
        </button>
      </div>
    </header>

    <!-- Body -->
    <main class="saas-main">

      <!-- Page header -->
      <div class="saas-page-header">
        <div>
          <h1 class="saas-page-title">Gestion des organisations</h1>
          <p class="saas-page-desc">Gérez les salons et établissements abonnés à la plateforme</p>
        </div>
        <button class="saas-btn-primary" @click="openCreate">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Nouvelle organisation
        </button>
      </div>

      <!-- KPI cards -->
      <div class="saas-kpi-row saas-kpi-row--4">
        <div class="saas-kpi">
          <div class="saas-kpi-icon blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <div>
            <div class="saas-kpi-value">{{ organizations.length }}</div>
            <div class="saas-kpi-label">Organisations totales</div>
          </div>
        </div>
        <div class="saas-kpi">
          <div class="saas-kpi-icon green">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div>
            <div class="saas-kpi-value">{{ totalActive }}</div>
            <div class="saas-kpi-label">Actives</div>
          </div>
        </div>
        <div class="saas-kpi">
          <div class="saas-kpi-icon red">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          </div>
          <div>
            <div class="saas-kpi-value">{{ totalInactive }}</div>
            <div class="saas-kpi-label">Suspendues</div>
          </div>
        </div>
        <div class="saas-kpi">
          <div class="saas-kpi-icon orange">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div>
            <div class="saas-kpi-value">{{ totalExpired }}</div>
            <div class="saas-kpi-label">Expirés</div>
          </div>
        </div>
      </div>

      <!-- Search + table -->
      <div class="saas-card">
        <div class="saas-card-toolbar">
          <div class="saas-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input v-model="searchQuery" type="text" placeholder="Rechercher par nom, type ou téléphone…" />
          </div>
          <span class="saas-result-count">{{ filteredOrgs.length }} organisation{{ filteredOrgs.length !== 1 ? 's' : '' }}</span>
        </div>

        <div v-if="loading" class="saas-loading">
          <div class="saas-spinner"></div>
          <p>Chargement…</p>
        </div>

        <div v-else-if="filteredOrgs.length" class="table-wrap">
        <table class="saas-table">
          <thead>
            <tr>
              <th>Organisation</th>
              <th>Type</th>
              <th>Téléphone</th>
              <th>WhatsApp</th>
              <th>Créée le</th>
              <th>Statut</th>
              <th>Abonnement</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="org in filteredOrgs" :key="org.id">
              <td>
                <div class="org-name-cell">
                  <div class="org-avatar">{{ org.name?.charAt(0).toUpperCase() }}</div>
                  <div>
                    <div class="org-name">{{ org.name }}</div>
                    <div class="org-id">#{{ org.id.split('-')[0] }}</div>
                  </div>
                </div>
              </td>
              <td data-label="Type">
                <span class="type-badge">{{ typeLabel(org.type) }}</span>
              </td>
              <td data-label="Téléphone" class="text-muted">{{ org.phone || '—' }}</td>
              <td data-label="WhatsApp" class="text-muted">{{ org.whatsapp_automation_number || '—' }}</td>
              <td data-label="Créée le" class="text-muted">{{ formatDate(org.created_at) }}</td>
              <td data-label="Statut">
                <span class="status-pill" :class="org.is_active ? 'active' : 'suspended'">
                  <span class="status-dot"></span>
                  {{ org.is_active ? 'Active' : 'Suspendue' }}
                </span>
              </td>
              <td data-label="Abonnement">
                <span v-if="org.subscription" class="sub-pill" :class="'sub-pill--' + org.subscription.status">
                  {{ { trial: 'Essai', active: 'Actif', suspended: 'Suspendu', cancelled: 'Annulé' }[org.subscription.status] || org.subscription.status }}
                </span>
                <span v-else class="sub-pill sub-pill--none">—</span>
              </td>
              <td>
                <div class="saas-actions">
                  <button class="saas-action-btn" @click="openDrawer(org)" title="Ouvrir la fiche">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  </button>
                  <button class="saas-action-btn" @click="openEdit(org)" title="Modifier">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button
                    class="saas-action-btn"
                    :class="org.is_active ? 'danger' : 'success'"
                    @click="toggle(org)"
                    :title="org.is_active ? 'Suspendre' : 'Réactiver'"
                  >
                    <svg v-if="org.is_active" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
        <div v-else class="saas-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
          <p>Aucune organisation trouvée</p>
        </div>
      </div>
    </main>

    <OrganizationModal
      v-if="showModal"
      :organization="selectedOrg"
      @close="showModal = false"
      @saved="onSaved"
    />
    <OrgDrawer
      v-if="drawerOrg"
      :org="drawerOrg"
      @close="drawerOrg = null"
      @updated="load"
    />
  </div>
</template>

<style scoped>
/* ── Layout ── */
.saas-layout {
  min-height: 100vh;
  background: var(--bg-soft);
  display: flex;
  flex-direction: column;
}

/* ── Topbar ── */
.saas-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  height: 64px;
  background: var(--text-main);
  border-bottom: 1px solid var(--bg-soft);
  position: sticky;
  top: 0;
  z-index: 100;
}

.saas-brand { display: flex; align-items: center; gap: 12px; }
.saas-brand-icon {
  width: 36px; height: 36px;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
}
.saas-brand-text { display: flex; flex-direction: column; }
.saas-brand-name { font-size: 15px; font-weight: 800; color: #fff; letter-spacing: -.3px; }
.saas-brand-tag  { font-size: 10px; font-weight: 600; color: var(--primary); text-transform: uppercase; letter-spacing: .08em; }

.saas-nav { display: flex; align-items: center; gap: 4px; flex: 1; }
.saas-nav-link {
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 13px; font-weight: 600;
  color: var(--text-light);
  text-decoration: none;
  transition: all .15s;
}
.saas-nav-link:hover { color: #fff; background: var(--primary-soft); }
.saas-nav-link.router-link-active { color: #fff; background: var(--primary-soft); }

.saas-topbar-right { display: flex; align-items: center; gap: 20px; }
.saas-user { display: flex; align-items: center; gap: 10px; }
.saas-user-avatar {
  width: 34px; height: 34px; border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: #fff; font-size: 14px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.saas-user-name  { font-size: 13px; font-weight: 700; color: #fff; }
.saas-user-role  { font-size: 10.5px; color: var(--text-muted); }

.saas-logout {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px;
  background: transparent;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  color: var(--text-light);
  font-size: 12.5px; font-weight: 600;
  cursor: pointer;
  transition: all .15s;
}
.saas-logout:hover { background: var(--primary-soft); color: #fff; border-color: var(--primary-mid); }

/* ── Main ── */
.saas-main {
  flex: 1;
  padding: 32px;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── Page header ── */
.saas-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.saas-page-title { font-size: 22px; font-weight: 800; color: var(--text-main); margin: 0; }
.saas-page-desc  { font-size: 13px; color: var(--text-muted); margin: 4px 0 0; }

.saas-btn-primary {
  display: flex; align-items: center; gap: 7px;
  padding: 10px 18px;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 13.5px; font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 2px 8px var(--primary-glow);
  transition: opacity .15s;
}
.saas-btn-primary:hover { opacity: .9; }

/* ── KPI ── */
.saas-kpi-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.saas-kpi-row--4 {
  grid-template-columns: repeat(4, 1fr);
}
.saas-kpi {
  background: #fff;
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  padding: 20px 22px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,.04);
}
.saas-kpi-icon {
  width: 44px; height: 44px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.saas-kpi-icon.blue   { background: var(--primary-soft); color: var(--primary-light); }
.saas-kpi-icon.green  { background: #f0fdf4; color: #22c55e; }
.saas-kpi-icon.red    { background: #fef2f2; color: #ef4444; }
.saas-kpi-icon.orange { background: #fff7ed; color: #f97316; }
.saas-kpi-value { font-size: 28px; font-weight: 800; color: var(--text-main); line-height: 1; }
.saas-kpi-label { font-size: 12px; color: var(--text-muted); font-weight: 600; margin-top: 4px; }

/* ── Card ── */
.saas-card {
  background: #fff;
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,.04);
}

.saas-card-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--bg-soft);
  gap: 12px;
}

.saas-search {
  display: flex; align-items: center; gap: 8px;
  flex: 1;
  max-width: 360px;
  background: var(--bg-main);
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--text-light);
}
.saas-search input {
  border: none; background: transparent; outline: none;
  font-size: 13px; color: var(--text-main); flex: 1;
}

.saas-result-count { font-size: 12.5px; color: var(--text-light); font-weight: 600; white-space: nowrap; }

/* ── Table ── */
.saas-table { width: 100%; border-collapse: collapse; }
.saas-table thead th {
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--text-light);
  padding: 10px 16px;
  background: var(--bg-main);
  border-bottom: 1px solid var(--border-strong);
}
.saas-table tbody tr {
  border-bottom: 1px solid var(--bg-soft);
  transition: background .12s;
}
.saas-table tbody tr:last-child { border-bottom: none; }
.saas-table tbody tr:hover { background: var(--bg-main); }
.saas-table td { padding: 14px 16px; vertical-align: middle; font-size: 13.5px; }
.text-muted { color: var(--text-muted); }

.org-name-cell { display: flex; align-items: center; gap: 12px; }
.org-avatar {
  width: 38px; height: 38px; border-radius: 10px;
  background: linear-gradient(135deg, var(--primary-soft), var(--primary-mid));
  color: var(--primary-light); font-size: 15px; font-weight: 800;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.org-name { font-size: 14px; font-weight: 700; color: var(--text-main); }
.org-id   { font-size: 11px; color: var(--text-light); margin-top: 1px; }

.type-badge {
  display: inline-block;
  padding: 3px 10px;
  background: var(--bg-soft);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
}
.status-pill.active    { background: #f0fdf4; color: #16a34a; }
.status-pill.suspended { background: #fef2f2; color: #dc2626; }
.status-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: currentColor; flex-shrink: 0;
}

/* ── Actions ── */
.saas-actions { display: flex; align-items: center; gap: 6px; }
.saas-action-btn {
  width: 32px; height: 32px;
  border: 1px solid var(--border-strong);
  background: #fff;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--text-muted);
  transition: all .15s;
}
.saas-action-btn:hover         { background: var(--bg-soft); color: var(--text-main); border-color: var(--border-strong); }
.saas-action-btn.danger:hover  { background: #fef2f2; color: #dc2626; border-color: #fca5a5; }
.saas-action-btn.success:hover { background: #f0fdf4; color: #16a34a; border-color: #86efac; }

/* ── States ── */
.saas-loading, .saas-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 10px; padding: 56px 20px;
  color: var(--text-light); font-size: 14px;
}
.saas-spinner {
  width: 28px; height: 28px;
  border: 3px solid var(--border-strong);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Table wrap (scroll uniquement sur le tableau, pas le toolbar) ── */
.table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }

/* ── Tablette (≤ 900px) ── */
@media (max-width: 900px) {
  .saas-main        { padding: 16px; gap: 16px; }
  .saas-topbar      { padding: 0 16px; height: 56px; }
  .saas-user        { display: none; }
  .saas-kpi-row     { gap: 10px; grid-template-columns: repeat(2, 1fr); }
  .saas-kpi-row--4  { grid-template-columns: repeat(2, 1fr); }
  .saas-kpi         { padding: 14px 16px; gap: 10px; }
  .saas-kpi-value   { font-size: 22px; }
  .saas-page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
  .saas-btn-primary { width: 100%; justify-content: center; }
  .saas-table       { min-width: 600px; }
}

/* ── Badges abonnement ── */
.sub-pill {
  display: inline-flex; align-items: center;
  padding: 3px 9px; border-radius: 999px;
  font-size: 11px; font-weight: 700; white-space: nowrap;
}
.sub-pill--active    { background: #dcfce7; color: #166534; }
.sub-pill--trial     { background: var(--primary-soft); color: var(--primary); }
.sub-pill--suspended { background: #fef3c7; color: #92400e; }
.sub-pill--cancelled { background: #fee2e2; color: #991b1b; }
.sub-pill--none      { background: var(--bg-soft); color: var(--text-light); }

/* ── Mobile (≤ 600px) ── */
@media (max-width: 600px) {
  /* Topbar */
  .saas-brand-tag { display: none; }
  .saas-brand-name { font-size: 14px; }
  .saas-logout { padding: 7px 10px; }
  .saas-logout span { display: none; }

  /* KPI en colonne */
  .saas-kpi-row { grid-template-columns: 1fr; gap: 8px; }
  .saas-kpi-icon { width: 36px; height: 36px; }

  /* Toolbar */
  .saas-card-toolbar { flex-direction: column; align-items: stretch; gap: 10px; }
  .saas-search { max-width: unset; }
  .saas-result-count { text-align: right; }

  /* Table → cartes */
  .table-wrap { overflow-x: visible; }
  .saas-table { display: block; min-width: unset; }
  .saas-table thead { display: none; }
  .saas-table tbody { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
  .saas-table tbody tr {
    display: flex; flex-direction: column; gap: 8px;
    border: 1px solid var(--border-strong); border-radius: 12px;
    padding: 14px; background: #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,.04);
    border-bottom: 1px solid var(--border-strong) !important;
  }
  .saas-table tbody tr:hover { background: var(--bg-main); }
  .saas-table td {
    display: flex; align-items: center; justify-content: space-between;
    padding: 4px 0; font-size: 13px; border: none;
  }
  .saas-table td[data-label]::before {
    content: attr(data-label);
    font-size: 10.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .05em; color: var(--text-light); flex-shrink: 0; min-width: 80px;
  }
  .saas-table td:first-child {
    border-bottom: 1px solid var(--bg-soft) !important;
    padding-bottom: 10px; margin-bottom: 2px;
  }
  .saas-table td:last-child { justify-content: flex-end; padding-top: 4px; }
  .org-name-cell { flex: 1; }
}
</style>
