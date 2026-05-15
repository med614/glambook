<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  competences: {
    type: Array,
    required: true
  },
  modelValue: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue'])

const showDropdown = ref(false)

// Compétences sélectionnées
const selectedIds = computed({
  get: () => props.modelValue || [],
  set: (val) => emit('update:modelValue', val)
})

// Compétences disponibles (non sélectionnées)
const availableCompetences = computed(() => {
  return props.competences.filter(c => !selectedIds.value.includes(String(c.id)))
})

// Compétences sélectionnées (objets complets)
const selectedCompetences = computed(() => {
  return selectedIds.value
    .map(id => props.competences.find(c => String(c.id) === id))
    .filter(Boolean)
})

function addCompetence(competence) {
  if (!selectedIds.value.includes(String(competence.id))) {
    selectedIds.value = [...selectedIds.value, String(competence.id)]
  }
  showDropdown.value = false
}

function removeCompetence(competenceId) {
  selectedIds.value = selectedIds.value.filter(id => id !== competenceId)
}

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
}

function closeDropdown() {
  setTimeout(() => {
    showDropdown.value = false
  }, 200)
}
</script>

<template>
  <div class="modern-competence-selector">
    <!-- CHIPS SÉLECTIONNÉS -->
    <div v-if="selectedCompetences.length" class="selected-chips">
      <div
        v-for="comp in selectedCompetences"
        :key="comp.id"
        class="competence-chip"
      >
        <span class="chip-icon">✓</span>
        <span class="chip-label">{{ comp.name }}</span>
        <button
          type="button"
          class="chip-remove"
          @click="removeCompetence(String(comp.id))"
          title="Retirer cette compétence"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- BOUTON AJOUTER / DROPDOWN -->
    <div class="add-section">
      <div v-if="!showDropdown" class="add-trigger">
        <button
          type="button"
          class="btn-add-competence"
          @click="toggleDropdown"
          :disabled="availableCompetences.length === 0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>Ajouter une compétence</span>
          <span class="count-badge">{{ availableCompetences.length }}</span>
        </button>
      </div>

      <div v-else class="dropdown-panel">
        <div class="dropdown-header">
          <span class="dropdown-title">Sélectionner une compétence</span>
          <button
            type="button"
            class="btn-close-dropdown"
            @click="showDropdown = false"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="dropdown-list">
          <div
            v-if="availableCompetences.length === 0"
            class="empty-state-dropdown"
          >
            Toutes les compétences sont sélectionnées
          </div>
          <button
            v-for="comp in availableCompetences"
            :key="comp.id"
            type="button"
            class="dropdown-item"
            @mousedown.prevent="addCompetence(comp)"
          >
            <span class="item-icon">+</span>
            <span class="item-label">{{ comp.name }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modern-competence-selector {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* CHIPS SÉLECTIONNÉS */
.selected-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.competence-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px 7px 12px;
  background: linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%);
  border: 1.5px solid #bae6fd;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #0c4a6e;
  transition: all 0.2s;
  position: relative;
}

.competence-chip:hover {
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  border-color: #fca5a5;
  padding-right: 8px;
}

.chip-icon {
  font-size: 11px;
  color: #0369a1;
  font-weight: 700;
}

.chip-label {
  user-select: none;
}

.chip-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
  padding: 0;
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.chip-remove:hover {
  background: #ef4444;
  color: white;
  transform: scale(1.15);
}

.competence-chip:hover .chip-icon {
  color: #dc2626;
}

.competence-chip:hover .chip-label {
  color: #991b1b;
}

/* SECTION AJOUT */
.add-section {
  position: relative;
}

.btn-add-competence {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: white;
  border: 1.5px dashed #cbd5e1;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-add-competence:hover:not(:disabled) {
  border-color: #3182ce;
  color: #3182ce;
  background: #f0f9ff;
}

.btn-add-competence:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: #e2e8f0;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
}

/* DROPDOWN PANEL */
.dropdown-panel {
  display: flex;
  flex-direction: column;
  background: white;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.dropdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: #f8fafc;
  border-bottom: 1.5px solid #e2e8f0;
}

.dropdown-title {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.btn-close-dropdown {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
  padding: 0;
}

.btn-close-dropdown:hover {
  background: #e2e8f0;
  color: #64748b;
}

/* LISTE DROPDOWN */
.dropdown-list {
  max-height: 240px;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.dropdown-item:hover {
  background: #f1f5f9;
  color: #1e293b;
}

.item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: #e0f2fe;
  color: #0369a1;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}

.dropdown-item:hover .item-icon {
  background: #bae6fd;
}

.item-label {
  flex: 1;
}

.empty-state-dropdown {
  padding: 20px;
  text-align: center;
  font-size: 13px;
  color: #94a3b8;
  font-weight: 500;
}

/* SCROLLBAR */
.dropdown-list::-webkit-scrollbar {
  width: 6px;
}

.dropdown-list::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 3px;
}

.dropdown-list::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

.dropdown-list::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>