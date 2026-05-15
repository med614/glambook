<script setup>
import { ref, onMounted } from 'vue'
import { fetchServiceCategories, createCategory, updateCategory, deleteCategory } from '@/services/services.service'

const categories = ref([])
const isLoading  = ref(true)
const showModal  = ref(false)
const editing    = ref(null)
const saving     = ref(false)
const errorMsg   = ref('')

const PRESET_COLORS = [
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#f43f5e',
  '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4',
  '#64748b', '#0f172a'
]

const form = ref({ name: '', color: '#3b82f6', is_active: true })

async function load() {
  isLoading.value = true
  try { categories.value = await fetchServiceCategories() }
  finally { isLoading.value = false }
}

onMounted(load)

function openCreate() {
  editing.value = null
  form.value = { name: '', color: '#3b82f6', is_active: true }
  errorMsg.value = ''
  showModal.value = true
}

function openEdit(cat) {
  editing.value = cat
  form.value = { name: cat.name, color: cat.color || '#3b82f6', is_active: cat.is_active }
  errorMsg.value = ''
  showModal.value = true
}

async function save() {
  if (!form.value.name.trim()) { errorMsg.value = 'Le nom est obligatoire.'; return }
  saving.value = true
  errorMsg.value = ''
  try {
    editing.value
      ? await updateCategory(editing.value.id, form.value)
      : await createCategory(form.value)
    showModal.value = false
    await load()
  } catch (e) {
    errorMsg.value = e.message || 'Erreur lors de la sauvegarde.'
  } finally {
    saving.value = false
  }
}

async function remove(cat) {
  if (!confirm(`Supprimer "${cat.name}" ? Les services liés seront déliés.`)) return
  try { await deleteCategory(cat.id); await load() }
  catch (e) { alert(e.message || 'Impossible de supprimer.') }
}

async function toggle(cat) {
  await updateCategory(cat.id, { ...cat, is_active: !cat.is_active })
  await load()
}
</script>

<template>
  <div class="page">

    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Catégories</h1>
        <p class="page-desc">{{ categories.length }} catégorie{{ categories.length !== 1 ? 's' : '' }} — utilisées pour les prestations et les compétences du staff</p>
      </div>
      <button class="btn btn-primary" @click="openCreate">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Nouvelle catégorie
      </button>
    </div>

    <!-- Loader -->
    <div v-if="isLoading" class="loading-row">
      <div class="spinner"></div>
    </div>

    <!-- Table -->
    <div v-else class="data-card">
      <table class="table">
        <thead>
          <tr>
            <th style="width:48px;"></th>
            <th>Nom</th>
            <th>Couleur</th>
            <th>Statut</th>
            <th style="width:100px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cat in categories" :key="cat.id" :class="{ 'row-inactive': !cat.is_active }">

            <!-- Icône colorée -->
            <td>
              <div class="cat-icon" :style="{ background: (cat.color || '#6366f1') + '20', color: cat.color || '#6366f1' }">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/>
                  <line x1="14" y1="5" x2="20" y2="5"/><line x1="14" y1="12" x2="20" y2="12"/><line x1="14" y1="19" x2="20" y2="19"/>
                </svg>
              </div>
            </td>

            <!-- Nom -->
            <td>
              <span class="cat-name">{{ cat.name }}</span>
            </td>

            <!-- Couleur -->
            <td>
              <span class="color-dot" :style="{ background: cat.color || '#6366f1' }"></span>
            </td>

            <!-- Statut -->
            <td>
              <span class="status-pill" :class="cat.is_active ? 'active' : 'inactive'">
                <span class="status-dot"></span>
                {{ cat.is_active ? 'Active' : 'Inactive' }}
              </span>
            </td>

            <!-- Actions -->
            <td>
              <div class="row-actions">
                <button class="action-btn" title="Modifier" @click="openEdit(cat)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="action-btn" :title="cat.is_active ? 'Désactiver' : 'Activer'" @click="toggle(cat)">
                  <svg v-if="cat.is_active" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                  <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                </button>
                <button class="action-btn danger" title="Supprimer" @click="remove(cat)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                </button>
              </div>
            </td>
          </tr>

          <tr v-if="!categories.length">
            <td colspan="5" class="empty-cell">
              <div class="empty-inner">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:#cbd5e1">
                  <circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/>
                  <line x1="14" y1="5" x2="20" y2="5"/><line x1="14" y1="12" x2="20" y2="12"/><line x1="14" y1="19" x2="20" y2="19"/>
                </svg>
                <p>Aucune catégorie — cliquez sur "Nouvelle catégorie" pour commencer</p>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="overlay" @mousedown.self="showModal = false">
        <div class="modal">

          <!-- Preview header coloré -->
          <div class="modal-preview" :style="{ background: form.color + '18', borderBottom: `3px solid ${form.color}` }">
            <div class="preview-badge" :style="{ background: form.color + '25', color: form.color, border: `1.5px solid ${form.color}40` }">
              <span class="preview-dot" :style="{ background: form.color }"></span>
              {{ form.name || 'Nom de la catégorie' }}
            </div>
            <div class="modal-close-wrap">
              <button class="modal-close" @click="showModal = false">&times;</button>
            </div>
          </div>

          <div class="modal-inner">
            <h2 class="modal-title">{{ editing ? 'Modifier la catégorie' : 'Nouvelle catégorie' }}</h2>

            <div v-if="errorMsg" class="error-banner">{{ errorMsg }}</div>

            <!-- Nom -->
            <div class="field">
              <label>Nom *</label>
              <input v-model="form.name" type="text" placeholder="Ex: Coupe, Coloration, Barbe…" @keydown.enter="save" />
            </div>

            <!-- Couleur -->
            <div class="field">
              <label>Couleur</label>
              <div class="color-grid">
                <button
                  v-for="c in PRESET_COLORS"
                  :key="c"
                  type="button"
                  class="swatch"
                  :class="{ active: form.color === c }"
                  :style="{ background: c }"
                  @click="form.color = c"
                >
                  <svg v-if="form.color === c" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>
                </button>
                <!-- Picker libre -->
                <label class="swatch custom-swatch" :style="{ background: PRESET_COLORS.includes(form.color) ? '#f1f5f9' : form.color }" title="Couleur personnalisée">
                  <svg v-if="PRESET_COLORS.includes(form.color)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                  <input type="color" v-model="form.color" style="opacity:0;position:absolute;width:0;height:0;" />
                </label>
              </div>
            </div>

            <!-- Statut (edit seulement) -->
            <div v-if="editing" class="field">
              <label>Statut</label>
              <div class="toggle-row">
                <span>{{ form.is_active ? 'Active' : 'Inactive' }}</span>
                <label class="toggle">
                  <input type="checkbox" v-model="form.is_active" />
                  <span class="slider"></span>
                </label>
              </div>
            </div>
          </div>

          <div class="modal-foot">
            <button class="btn-cancel" @click="showModal = false" :disabled="saving">Annuler</button>
            <button class="btn-save" @click="save" :disabled="saving || !form.name.trim()">
              {{ saving ? 'Enregistrement…' : (editing ? 'Enregistrer' : 'Créer') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* ── Table ── */
.row-inactive { opacity: .45; }

.cat-icon {
  width: 36px; height: 36px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
}

.cat-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.color-preview {
  display: flex;
  align-items: center;
  gap: 8px;
}
.color-dot {
  display: block;
  width: 20px; height: 20px;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0,0,0,.2);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}
.status-pill.active  { background: #dcfce7; color: #15803d; }
.status-pill.inactive { background: #f1f5f9; color: #64748b; }
.status-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.row-actions { display: flex; gap: 4px; justify-content: flex-end; }

.action-btn {
  width: 30px; height: 30px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  background: #fff;
  color: var(--text-muted);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all .15s;
}
.action-btn:hover { background: #f8fafc; color: var(--text-main); border-color: #cbd5e1; }
.action-btn.danger:hover { background: #fef2f2; border-color: #fca5a5; color: #dc2626; }

.empty-cell { padding: 0 !important; }
.empty-inner {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 56px 20px; gap: 12px;
  color: var(--text-muted); font-size: 14px; text-align: center;
}

.loading-row {
  display: flex; justify-content: center;
  padding: 60px;
}

/* ── Modal ── */
.overlay {
  position: fixed; inset: 0;
  background: rgba(15,23,42,.5);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999; padding: 20px;
}
.modal {
  background: #fff;
  border-radius: 18px;
  width: 100%; max-width: 400px;
  box-shadow: 0 32px 80px rgba(0,0,0,.18);
  overflow: hidden;
  display: flex; flex-direction: column;
}

/* Preview band */
.modal-preview {
  padding: 20px 20px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background .2s, border-color .2s;
}
.preview-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 14px;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 700;
  max-width: 260px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all .2s;
}
.preview-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background .2s;
}
.modal-close-wrap { flex-shrink: 0; }
.modal-close {
  width: 28px; height: 28px;
  border: none; background: rgba(255,255,255,.6);
  border-radius: 50%; font-size: 18px;
  color: #475569; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(4px);
}
.modal-close:hover { background: rgba(255,255,255,.9); }

.modal-inner {
  padding: 20px 24px;
  display: flex; flex-direction: column; gap: 18px;
}
.modal-title {
  font-size: 15px; font-weight: 800; color: #0f172a; margin: 0;
}

.error-banner {
  padding: 10px 14px;
  background: #fef2f2; border: 1px solid #fca5a5;
  border-radius: 8px; font-size: 13px; color: #dc2626; font-weight: 600;
}

.field { display: flex; flex-direction: column; gap: 7px; }
.field label {
  font-size: 11px; font-weight: 700; color: #64748b;
  text-transform: uppercase; letter-spacing: .06em;
}
.field input[type=text] {
  padding: 10px 13px;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  font-size: 14px; color: #0f172a;
  background: #f8fafc;
  transition: border-color .15s, background .15s;
  font-family: inherit;
}
.field input[type=text]:focus {
  outline: none; border-color: #6366f1; background: #fff;
  box-shadow: 0 0 0 3px rgba(99,102,241,.1);
}

/* Swatches */
.color-grid {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
}
.swatch {
  width: 32px; height: 32px;
  border-radius: 9px;
  border: 2.5px solid transparent;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: transform .12s, box-shadow .12s;
  flex-shrink: 0;
  position: relative;
}
.swatch:hover { transform: scale(1.15); box-shadow: 0 2px 8px rgba(0,0,0,.2); }
.swatch.active { border-color: #0f172a; transform: scale(1.1); box-shadow: 0 2px 8px rgba(0,0,0,.2); }

.custom-swatch {
  background: #f1f5f9;
  border: 1.5px dashed #cbd5e1;
  overflow: hidden;
}
.custom-swatch:hover { border-color: #94a3b8; }

/* Toggle */
.toggle-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 13px;
  border: 1.5px solid #e2e8f0; border-radius: 10px;
  background: #f8fafc;
  font-size: 13.5px; color: #0f172a; font-weight: 600;
}
.toggle { position: relative; display: inline-block; width: 40px; height: 22px; }
.toggle input { display: none; }
.slider { position: absolute; inset: 0; background: #cbd5e1; border-radius: 22px; cursor: pointer; transition: .25s; }
.slider:before { content: ''; position: absolute; width: 16px; height: 16px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: .25s; }
.toggle input:checked + .slider { background: #6366f1; }
.toggle input:checked + .slider:before { transform: translateX(18px); }

/* Footer */
.modal-foot {
  display: flex; align-items: center; justify-content: flex-end;
  gap: 10px; padding: 14px 24px;
  border-top: 1px solid #f1f5f9; background: #fafafa;
}
.btn-cancel {
  padding: 9px 18px; border: 1.5px solid #e2e8f0; border-radius: 9px;
  background: #fff; color: #64748b; font-size: 13.5px; font-weight: 600;
  cursor: pointer; transition: all .15s;
}
.btn-cancel:hover:not(:disabled) { background: #f1f5f9; }
.btn-save {
  padding: 9px 22px; border: none; border-radius: 9px;
  background: linear-gradient(135deg, #6366f1, #3b82f6);
  color: #fff; font-size: 13.5px; font-weight: 700;
  cursor: pointer; box-shadow: 0 2px 8px rgba(99,102,241,.3);
  transition: opacity .15s;
}
.btn-save:hover:not(:disabled) { opacity: .9; }
.btn-save:disabled, .btn-cancel:disabled { opacity: .5; cursor: not-allowed; }

/* Spinner */
.spinner {
  width: 28px; height: 28px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
