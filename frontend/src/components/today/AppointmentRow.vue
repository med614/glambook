<template>
  <li class="appointment-item" :class="status" @click="emit('edit')">
    <div class="row-indicator"></div>

    <div class="time-block">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
      <span class="time-text">{{ time }}</span>
    </div>

    <div class="client-block">
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="client-name">{{ client }}</span>
        <span v-if="isExternal" class="external-flag">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Externe
        </span>
      </div>
      <span class="service-tag" v-if="service">{{ service }}</span>
    </div>

    <div class="action-block">
      <button
        v-if="status === 'current' || status === 'upcoming'"
        class="finish-btn"
        @click.stop="emit('finish')"
        title="Terminer le RDV"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Terminer
      </button>
      <div v-else-if="status === 'past'" class="past-badge">Terminé</div>
    </div>
  </li>
</template>

<script setup>
const emit = defineEmits(['edit', 'finish'])

defineProps({
  time: String,
  client: String,
  service: String,
  status: String,
  isExternal: { type: Boolean, default: false }
})
</script>

<style scoped>
.appointment-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid var(--border);
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
  list-style: none;
}

.appointment-item:last-child { margin-bottom: 0; }

.appointment-item:hover {
  border-color: var(--primary);
  transform: translateX(3px);
}

.row-indicator {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
  background: transparent;
  border-radius: 2px 0 0 2px;
}

.appointment-item.current  { background: var(--green-soft); border-color: rgba(21,128,61,.2); }
.appointment-item.current .row-indicator { background: var(--green); }

.appointment-item.upcoming { background: var(--primary-soft); border-color: rgba(168,129,10,.2); }
.appointment-item.upcoming .row-indicator { background: var(--primary); }

.appointment-item.past { opacity: 0.55; filter: grayscale(1); }

.time-block {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  background: rgba(0,0,0,0.04);
  border-radius: 6px;
  color: var(--text-muted);
  min-width: 80px;
  flex-shrink: 0;
}

.time-text { font-size: 11px; font-weight: 800; }

.client-block { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.client-name { font-size: 13.5px; font-weight: 700; color: var(--text-main); }
.service-tag {
  font-size: 11px; color: var(--text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.finish-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  background: var(--primary);
  color: #fff;
  border: none;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.15s;
}
.finish-btn:hover { background: var(--primary-light); }

.external-flag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 9.5px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--orange-soft);
  color: var(--orange);
  border: 1px solid rgba(217,119,6,.25);
  white-space: nowrap;
}

.past-badge {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--text-light);
  letter-spacing: 0.05em;
  flex-shrink: 0;
}
</style>
