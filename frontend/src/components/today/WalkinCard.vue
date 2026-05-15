<script setup>
defineEmits(['serve'])
defineProps({ walkins: { type: Array, default: () => [] } })
</script>

<template>
  <div class="queue-card">
    <div v-if="walkins.length" class="queue-list">
      <div v-for="(w, i) in walkins" :key="w.id" class="queue-item">
        <div class="queue-pos">{{ i + 1 }}</div>
        <div class="queue-info">
          <div class="queue-client">{{ w.client }}</div>
          <div class="queue-service">{{ w.service || 'Prestation non définie' }}</div>
          <div class="queue-time">Arrivée {{ w.time }}</div>
        </div>
        <button class="serve-btn" @click.stop="$emit('serve', w)">
          Servir
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </div>
    </div>

    <div v-else class="queue-empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-light)">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <p>File vide</p>
      <span>Tous les clients sont servis</span>
    </div>
  </div>
</template>

<style scoped>
.queue-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.queue-list { display: flex; flex-direction: column; }

.queue-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  transition: background 0.15s;
}
.queue-item:last-child { border-bottom: none; }
.queue-item:hover { background: var(--bg-main); }

.queue-pos {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bg-main);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.queue-info { flex: 1; min-width: 0; }
.queue-client { font-size: 14px; font-weight: 700; color: var(--text-main); }
.queue-service { font-size: 12px; color: var(--text-muted); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.queue-time { font-size: 11px; color: var(--text-light); margin-top: 2px; }

.serve-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--primary);
  color: #fff;
  border: none;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.15s;
}
.serve-btn:hover { background: var(--primary-dark); }

.queue-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 40px 20px;
  text-align: center;
}
.queue-empty p { font-size: 14px; font-weight: 600; color: var(--text-muted); margin: 0; }
.queue-empty span { font-size: 12px; color: var(--text-light); }
</style>
