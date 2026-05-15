<script setup>
import { ref, watch, computed } from 'vue'
import BaseModal from '@/components/modal/BaseModal.vue'
import { createStaff, updateStaff } from '@/services/staff.service'

const props = defineProps({
  open: Boolean,
  staff: Object,
  categories: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'saved'])

const name       = ref('')
const join_date  = ref('')
const category_ids = ref([])
const is_active  = ref(true)
const errors     = ref({})
const submitting = ref(false)

const avatarFile    = ref(null)
const avatarPreview = ref(null)
const fileInput     = ref(null)

const currentAvatar = computed(() => avatarPreview.value || props.staff?.avatar_url || null)

watch(() => props.staff, (val) => {
  if (!val) {
    name.value = ''
    join_date.value = ''
    category_ids.value = []
    is_active.value = true
  } else {
    name.value = val.name || ''
    join_date.value = val.join_date || ''
    category_ids.value = val.categories ? val.categories.map(c => c.id) : []
    is_active.value = val.is_active ?? true
  }
  avatarFile.value = null
  avatarPreview.value = null
  errors.value = {}
}, { immediate: true })

function toggleCategory(id) {
  if (category_ids.value.includes(id)) {
    category_ids.value = category_ids.value.filter(c => c !== id)
  } else {
    category_ids.value = [...category_ids.value, id]
  }
  if (category_ids.value.length) delete errors.value.categories
}

function onAvatarChange(e) {
  const file = e.target.files[0]
  if (!file) return
  if (file.size > 2 * 1024 * 1024) { alert('L\'image ne doit pas dépasser 2 Mo.'); return }
  avatarFile.value = file
  avatarPreview.value = URL.createObjectURL(file)
}

watch(name, () => { if (name.value?.trim()) delete errors.value.name })

function validate() {
  const e = {}
  if (!name.value.trim()) e.name = 'Le nom est obligatoire'
  errors.value = e
  return Object.keys(e).length === 0
}

async function save() {
  if (!validate()) return
  submitting.value = true
  try {
    const payload = {
      name: name.value.trim(),
      join_date: join_date.value || null,
      is_active: is_active.value,
      category_ids: category_ids.value,
      avatarFile: avatarFile.value || undefined
    }
    if (props.staff?.id) {
      await updateStaff(props.staff.id, payload)
    } else {
      await createStaff(payload)
    }
    emit('saved')
    emit('close')
  } finally {
    submitting.value = false
  }
}

function close() {
  if (!submitting.value) emit('close')
}
</script>

<template>
  <BaseModal v-if="open" @close="close">
    <header class="modal-title">{{ staff ? 'Modifier le collaborateur' : 'Nouveau collaborateur' }}</header>

    <div class="modal-body">

      <!-- Avatar -->
      <div class="avatar-section">
        <div class="avatar-wrap" @click="fileInput?.click()" title="Changer la photo">
          <img v-if="currentAvatar" :src="currentAvatar" class="avatar-img" alt="Avatar" />
          <div v-else class="avatar-placeholder">
            <svg viewBox="0 0 128 128" width="130" height="130" xmlns="http://www.w3.org/2000/svg">
              <rect width="128" height="128" fill="#e2e8f0"/>
              <circle cx="64" cy="50" r="26" fill="#94a3b8"/>
              <ellipse cx="64" cy="110" rx="40" ry="28" fill="#94a3b8"/>
            </svg>
          </div>
          <div class="avatar-overlay">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            <span>Changer</span>
          </div>
        </div>
        <div class="avatar-hint">Cliquer pour changer · JPG/PNG · max 2 Mo</div>
        <input ref="fileInput" type="file" accept="image/*" style="display:none" @change="onAvatarChange" />
      </div>

      <!-- Nom -->
      <div class="form-group">
        <label>Nom complet *</label>
        <input v-model="name" type="text" placeholder="Ex: Amine BERRADA" class="form-input" :class="{ error: errors.name }" />
        <span v-if="errors.name" class="form-error">{{ errors.name }}</span>
      </div>

      <!-- Date d'intégration -->
      <div class="form-group">
        <label>Date d'intégration</label>
        <input v-model="join_date" type="date" class="form-input" />
      </div>

      <!-- Catégories / Compétences -->
      <div class="form-group">
        <label>Compétences</label>
        <div v-if="!categories.length" class="cat-empty">
          Aucune catégorie disponible — créez-en depuis Admin → Catégories
        </div>
        <div v-else class="cat-grid">
          <button
            v-for="cat in categories"
            :key="cat.id"
            type="button"
            class="cat-chip"
            :class="{ selected: category_ids.includes(cat.id) }"
            :style="category_ids.includes(cat.id) ? { background: cat.color + '22', borderColor: cat.color, color: cat.color } : {}"
            @click="toggleCategory(cat.id)"
          >
            <span class="cat-dot" :style="{ background: cat.color }"></span>
            {{ cat.name }}
            <svg v-if="category_ids.includes(cat.id)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
        </div>
        <span v-if="errors.categories" class="form-error">{{ errors.categories }}</span>
      </div>

      <!-- Statut -->
      <div class="toggle-field">
        <div>
          <div class="toggle-label">Statut du collaborateur</div>
          <div class="toggle-sub">{{ is_active ? 'Actif et disponible' : 'Suspendu temporairement' }}</div>
        </div>
        <label class="toggle">
          <input type="checkbox" v-model="is_active" />
          <span class="toggle-switch"></span>
        </label>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" @click="close" :disabled="submitting">Annuler</button>
      <button class="btn btn-primary" @click="save" :disabled="submitting">
        {{ submitting ? 'Enregistrement…' : (staff ? 'Enregistrer' : 'Créer') }}
      </button>
    </div>
  </BaseModal>
</template>

<style scoped>
.form-input {
  width: 100%;
  padding: 9px 12px;
  background: var(--bg-main);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13.5px;
  color: var(--text-main);
  box-sizing: border-box;
  transition: border-color .15s;
}
.form-input:focus { outline: none; border-color: var(--primary); }
.form-input.error { border-color: #ef4444; }

/* Catégories */
.cat-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cat-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1.5px solid var(--border);
  border-radius: 999px;
  background: #fff;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all .15s;
}
.cat-chip:hover { border-color: #94a3b8; color: var(--text-main); }
.cat-chip.selected { font-weight: 700; }

.cat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.cat-empty {
  padding: 12px;
  background: var(--bg-main);
  border: 1px dashed var(--border);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}

/* Toggle */
.toggle-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--bg-main);
  border: 1px solid var(--border);
  border-radius: 8px;
  gap: 12px;
}
.toggle-label { font-size: 13.5px; font-weight: 600; color: var(--text-main); }
.toggle-sub { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; }

/* Avatar */
.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-bottom: 4px;
}
.avatar-wrap {
  position: relative;
  width: 130px; height: 130px;
  border-radius: 50%;
  cursor: pointer;
  overflow: hidden;
  border: 3px solid var(--border);
  transition: border-color .2s;
  box-shadow: 0 4px 16px rgba(0,0,0,.10);
}
.avatar-wrap:hover { border-color: var(--primary); }
.avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.avatar-placeholder { width: 100%; height: 100%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; }
.avatar-overlay {
  position: absolute; inset: 0;
  background: rgba(0,0,0,.45);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 4px; color: #fff;
  font-size: 11px; font-weight: 700;
  opacity: 0; transition: opacity .2s;
}
.avatar-wrap:hover .avatar-overlay { opacity: 1; }
.avatar-hint { font-size: 11px; color: var(--text-muted); text-align: center; }
</style>
