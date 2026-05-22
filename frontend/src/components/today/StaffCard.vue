<script setup>
const emit = defineEmits(['edit-appointment', 'finish-appointment'])

const props = defineProps({
  name: { type: String, required: true },
  color: { type: String, default: 'free' },
  appointments: { type: Array, default: () => [] },
  walkins: { type: Array, default: () => [] }
})

const statusLabel = { free: 'Disponible', busy: 'En cours', loaded: 'Chargé', full: 'Complet' }

function activeCount() {
  return [...props.appointments, ...props.walkins].filter(a => a.status !== 'past').length
}
</script>

<template>
  <div class="staff-card" :class="color">
    <!-- En-tête staff -->
    <div class="staff-header">
      <div class="staff-avatar">{{ name.charAt(0).toUpperCase() }}</div>
      <div class="staff-meta">
        <div class="staff-name">{{ name }}</div>
        <span class="status-badge">{{ statusLabel[color] || 'Disponible' }}</span>
      </div>
      <div class="staff-count" v-if="activeCount() > 0">
        {{ activeCount() }} en cours
      </div>
    </div>

    <!-- RDVs planifiés -->
    <div class="appt-section">
      <div class="section-title">Rendez-vous</div>
      <div v-if="appointments.length" class="appt-list">
        <div
          v-for="a in appointments"
          :key="a.id"
          class="appt-row"
          :class="a.status"
        >
          <div class="appt-time">{{ a.time }}</div>
          <div class="appt-info">
            <div class="appt-client">
              {{ a.client }}
              <span v-if="a.isExternal" class="ext-flag">Externe</span>
            </div>
            <div class="appt-service">{{ a.service }}</div>
          </div>
          <button
            v-if="a.status !== 'past'"
            class="finish-btn"
            @click="emit('finish-appointment', a.id)"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            Terminer
          </button>
          <span v-else class="done-badge">Terminé</span>
        </div>
      </div>
      <div v-else class="no-appt">Aucun RDV planifié</div>
    </div>

    <!-- Walk-ins affectés -->
    <div class="appt-section walkin-section" v-if="walkins.length">
      <div class="section-title">Sans rendez-vous</div>
      <div class="appt-list">
        <div
          v-for="w in walkins"
          :key="w.id"
          class="appt-row walkin"
          :class="w.status"
        >
          <div class="appt-time">{{ w.time || '—' }}</div>
          <div class="appt-info">
            <div class="appt-client">{{ w.client }}</div>
            <div class="appt-service">{{ w.service }}</div>
          </div>
          <button
            v-if="w.status !== 'past'"
            class="finish-btn"
            @click="emit('finish-appointment', w.id)"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            Terminer
          </button>
          <span v-else class="done-badge">Terminé</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.staff-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Couleur bord gauche selon charge */
.staff-card.free   { border-left: 4px solid var(--green); }
.staff-card.busy   { border-left: 4px solid var(--primary); }
.staff-card.loaded { border-left: 4px solid var(--orange); }
.staff-card.full   { border-left: 4px solid var(--red); }

/* EN-TÊTE */
.staff-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-main);
}

.staff-avatar {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--primary-soft);
  color: var(--primary-text);
  font-size: 17px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.staff-meta { flex: 1; }
.staff-name { font-size: 15px; font-weight: 700; color: var(--text-main); }

.status-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 7px;
  border-radius: 999px;
  margin-top: 3px;
}

.free   .status-badge { background: var(--green-soft);   color: var(--green); }
.busy   .status-badge { background: var(--primary-soft); color: var(--primary); }
.loaded .status-badge { background: var(--orange-soft);  color: var(--orange); }
.full   .status-badge { background: var(--red-soft);     color: var(--red); }

.staff-count {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 3px 9px;
  border-radius: 999px;
}

/* SECTIONS */
.appt-section { padding: 12px 16px; }
.walkin-section { border-top: 1px dashed var(--border); }

.section-title {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-light);
  margin-bottom: 10px;
}

.no-appt {
  font-size: 12.5px;
  color: var(--text-light);
  font-style: italic;
  padding: 4px 0;
}

/* LIGNES DE RDV */
.appt-list { display: flex; flex-direction: column; gap: 6px; }

.appt-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-card);
}

.appt-row.current  { background: var(--green-soft);   border-color: rgba(21,128,61,.2); }
.appt-row.upcoming { background: var(--primary-soft);  border-color: rgba(168,129,10,.2); }
.appt-row.past     { opacity: 0.5; filter: grayscale(1); }
.appt-row.walkin   { border-style: dashed; }

.appt-time {
  font-size: 11.5px;
  font-weight: 800;
  color: var(--text-muted);
  min-width: 72px;
  flex-shrink: 0;
}

.appt-info { flex: 1; min-width: 0; }
.appt-client {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 6px;
}
.appt-service { font-size: 11.5px; color: var(--text-muted); margin-top: 1px; }

.ext-flag {
  font-size: 9.5px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--orange-soft);
  color: var(--orange);
  border: 1px solid rgba(217,119,6,.25);
}

.finish-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  background: var(--primary);
  color: #fff;
  border: none;
  padding: 6px 12px;
  border-radius: 7px;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.15s;
}
.finish-btn:hover { background: var(--primary-light); }

.done-badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-light);
  letter-spacing: 0.05em;
  flex-shrink: 0;
}
</style>
