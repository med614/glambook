<script setup>
  import { ref, watch, onMounted } from 'vue'
  import CustomSelect from '@/components/common/CustomSelect.vue'
  
  /* ==============================
     PROPS / EMITS
  ============================== */
  const props = defineProps({
    staff: {
      type: Array,
      default: () => []
    },
    date: {
      type: String,
      default: null
    }
  })
  
  const emit = defineEmits(['change', 'add'])
  
  /* ==============================
     LOCAL STATE
  ============================== */
  const localDate = ref(props.date)      // null = tous les RDV
  const localStaffId = ref(null)
  const localAssignment = ref('all')
  const localLocation = ref('all')       // 👈 NOUVEAU : lieu
  
  /* ==============================
     EMIT FILTERS
  ============================== */
  function emitChange() {
    emit('change', {
      date: localDate.value,
      staffId: localStaffId.value,
      assignment: localAssignment.value,
      location: localLocation.value      // 👈 NOUVEAU
    })
  }
  
  watch(
    [localDate, localStaffId, localAssignment, localLocation],
    emitChange
  )
  
  /* ==============================
     INIT → LOAD ALL RDV
  ============================== */
  onMounted(() => {
    emitChange()
  })
  
  /* ==============================
     ACTIONS
  ============================== */
  function clearDate() {
    localDate.value = null
  }
</script>

<template>
  <div class="filter-bar">

    <!-- DATE -->
    <div class="date-filter-wrapper search-input">
      <span class="search-icon">📅</span>
      <input
        type="date"
        v-model="localDate"
      />
      <button
        v-if="localDate"
        class="clear-date-btn"
        @click="clearDate"
        title="Tous les RDV"
      >
        ✕
      </button>
    </div>

    <!-- STAFF -->
    <div class="category-select-wrapper">
      <CustomSelect
        v-model="localStaffId"
        :options="[{ id: null, name: 'Tous les staff' }, ...staff]"
        placeholder="Tous les staff"
      />
    </div>

    <!-- AFFECTATION -->
    <div class="category-select-wrapper">
      <CustomSelect
        v-model="localAssignment"
        :options="[
          { id: 'all', name: 'Toutes les affectations' },
          { id: 'assigned', name: 'Affectés' },
          { id: 'unassigned', name: 'Non affectés' }
        ]"
        placeholder="Affectation"
      />
    </div>

    <!-- LIEU -->
    <div class="category-select-wrapper">
      <CustomSelect
        v-model="localLocation"
        :options="[
          { id: 'all', name: 'Tous les lieux' },
          { id: 'internal', name: 'Interne' },
          { id: 'external', name: 'Externe' }
        ]"
        placeholder="Lieu"
      />
    </div>

    <div class="spacer"></div>

  </div>
</template>

<style scoped>
.filter-bar {
  background: var(--bg-card);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 0;
  box-shadow: 0 1px 2px rgba(40,31,10,0.04);
}

.date-filter-wrapper {
  display: flex;
  align-items: center;
  background: var(--bg-main);
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  padding: 0 12px;
  height: 40px;
  transition: border 0.2s;
  flex: 1;
  max-width: 190px;
}

.date-filter-wrapper:focus-within {
  border-color: var(--primary);
  box-shadow: var(--input-focus-ring);
}

.date-filter-wrapper input {
  border: none;
  background: transparent;
  outline: none;
  width: 100%;
  font-size: 13px;
  color: var(--text-main);
  padding: 0;
}

.search-icon {
  font-size: 14px;
  color: var(--text-muted);
  margin-right: 10px;
  opacity: 0.7;
}

.clear-date-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
}

.clear-date-btn:hover {
  color: var(--text-main);
}

.category-select-wrapper {
  flex: 1;
  max-width: 210px;
}

.spacer { flex: 1; }

/* RESPONSIVE */
@media (max-width: 768px) {
  .filter-bar {
    flex-direction: column;
    align-items: stretch;
    height: auto;
    padding: 12px;
  }

  .date-filter-wrapper, .category-select-wrapper {
    max-width: 100%;
  }
}
</style>
