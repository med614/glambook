<script setup>
import { ref, onMounted } from 'vue'
import { fetchSettings, saveSettings, fetchClosures, addClosure, deleteClosure } from '@/services/settings.service'

const DAYS = [
  { key: 'mon', label: 'Lundi' },
  { key: 'tue', label: 'Mardi' },
  { key: 'wed', label: 'Mercredi' },
  { key: 'thu', label: 'Jeudi' },
  { key: 'fri', label: 'Vendredi' },
  { key: 'sat', label: 'Samedi' },
  { key: 'sun', label: 'Dimanche' },
]

const DEFAULT_HOURS = {
  mon: { active: true,  open: '09:00', close: '18:00' },
  tue: { active: true,  open: '09:00', close: '18:00' },
  wed: { active: true,  open: '09:00', close: '18:00' },
  thu: { active: true,  open: '09:00', close: '18:00' },
  fri: { active: true,  open: '09:00', close: '18:00' },
  sat: { active: true,  open: '09:00', close: '18:00' },
  sun: { active: false, open: '09:00', close: '18:00' },
}

const hours           = ref(JSON.parse(JSON.stringify(DEFAULT_HOURS)))
const noshowThreshold = ref(3)
const cancelThreshold = ref(5)
const whatsappEnabled = ref(true)
const whatsappShowPrices = ref(true)
const onlineEnabled = ref(true)
const onlineShowPrices = ref(true)
const closures        = ref([])
const newDateStart    = ref('')
const newDateEnd      = ref('')
const newLabel        = ref('')
const saving          = ref(false)
const savedMsg        = ref(false)

onMounted(async () => {
  const [settings, cl] = await Promise.all([fetchSettings(), fetchClosures()])
  if (settings) {
    hours.value = { ...DEFAULT_HOURS, ...settings.opening_hours }
    noshowThreshold.value = settings.noshow_threshold ?? 3
    cancelThreshold.value = settings.cancel_threshold ?? 5
    whatsappEnabled.value = settings.whatsapp_enabled ?? true
    whatsappShowPrices.value = settings.whatsapp_show_prices ?? true
    onlineEnabled.value = settings.online_enabled ?? true
    onlineShowPrices.value = settings.online_show_prices ?? true
  }
  closures.value = cl
})

async function save() {
  saving.value = true
  await saveSettings({
    opening_hours: hours.value,
    noshow_threshold: noshowThreshold.value,
    cancel_threshold: cancelThreshold.value,
    whatsapp_enabled: whatsappEnabled.value,
    whatsapp_show_prices: whatsappShowPrices.value,
    online_enabled: onlineEnabled.value,
    online_show_prices: onlineShowPrices.value,
  })
  saving.value = false
  savedMsg.value = true
  setTimeout(() => savedMsg.value = false, 2500)
}

async function addClose() {
  if (!newDateStart.value) return
  await addClosure(newDateStart.value, newDateEnd.value || newDateStart.value, newLabel.value)
  closures.value = await fetchClosures()
  newDateStart.value = ''
  newDateEnd.value = ''
  newLabel.value = ''
}

async function removeClose(id) {
  await deleteClosure(id)
  closures.value = closures.value.filter(c => c.id !== id)
}

function formatDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatRange(c) {
  if (!c.end_date || c.end_date === c.date) return formatDate(c.date)
  return `${formatDate(c.date)} → ${formatDate(c.end_date)}`
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Paramètres</h1>
        <p class="page-desc">Horaires, fermetures et règles du salon</p>
      </div>
      <button class="btn btn-primary" @click="save" :disabled="saving">
        {{ saving ? 'Enregistrement…' : savedMsg ? '✓ Enregistré' : 'Enregistrer' }}
      </button>
    </div>

    <div class="settings-grid">

      <!-- Horaires d'ouverture -->
      <div class="settings-card">
        <div class="card-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <h2>Horaires d'ouverture</h2>
        </div>

        <div class="hours-table">
          <div class="hours-row hours-head">
            <span>Jour</span>
            <span>Ouvert</span>
            <span>Ouverture</span>
            <span>Fermeture</span>
          </div>
          <div v-for="d in DAYS" :key="d.key" class="hours-row" :class="{ inactive: !hours[d.key]?.active }">
            <span class="day-label">{{ d.label }}</span>
            <label class="toggle" @click.stop>
              <input type="checkbox" v-model="hours[d.key].active" />
              <span class="toggle-switch"></span>
            </label>
            <input
              type="time"
              v-model="hours[d.key].open"
              class="time-input"
              :disabled="!hours[d.key].active"
            />
            <input
              type="time"
              v-model="hours[d.key].close"
              class="time-input"
              :disabled="!hours[d.key].active"
            />
          </div>
        </div>
      </div>

      <!-- Fermetures exceptionnelles -->
      <div class="settings-card">
        <div class="card-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="10" y1="14" x2="10" y2="14" stroke-width="3" stroke-linecap="round"/></svg>
          <h2>Fermetures exceptionnelles</h2>
        </div>

        <div class="closure-add">
          <div class="closure-dates">
            <div class="date-field">
              <label>Du</label>
              <input type="date" v-model="newDateStart" class="form-input" />
            </div>
            <div class="date-field">
              <label>Au</label>
              <input type="date" v-model="newDateEnd" :min="newDateStart" class="form-input" />
            </div>
          </div>
          <div class="closure-bottom">
            <input type="text" v-model="newLabel" placeholder="Motif (ex: Congés d'été)" class="form-input" />
            <button class="btn btn-primary" @click="addClose" :disabled="!newDateStart">Ajouter</button>
          </div>
        </div>

        <div v-if="closures.length" class="closure-list">
          <div v-for="c in closures" :key="c.id" class="closure-item">
            <div>
              <div class="closure-date">{{ formatRange(c) }}</div>
              <div v-if="c.label" class="closure-label">{{ c.label }}</div>
            </div>
            <button class="btn-remove" @click="removeClose(c.id)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div v-else class="empty-closures">Aucune fermeture exceptionnelle</div>
      </div>

      <!-- Seuils signalement clients -->
      <div class="settings-card">
        <div class="card-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <h2>Signalement clients</h2>
        </div>
        <p class="card-desc">Un badge d'alerte apparaît sur la fiche client quand ces seuils sont atteints.</p>

        <div class="threshold-row">
          <label>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            No-show — signaler après
          </label>
          <div class="threshold-control">
            <button class="btn-step" @click="noshowThreshold = Math.max(1, noshowThreshold - 1)">−</button>
            <span class="threshold-val">{{ noshowThreshold }}</span>
            <button class="btn-step" @click="noshowThreshold++">+</button>
            <span class="threshold-unit">fois</span>
          </div>
        </div>

        <div class="threshold-row">
          <label>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            Annulation — signaler après
          </label>
          <div class="threshold-control">
            <button class="btn-step" @click="cancelThreshold = Math.max(1, cancelThreshold - 1)">−</button>
            <span class="threshold-val">{{ cancelThreshold }}</span>
            <button class="btn-step" @click="cancelThreshold++">+</button>
            <span class="threshold-unit">fois</span>
          </div>
        </div>
      </div>

      <!-- WhatsApp -->
      <div class="settings-card card-coming-soon">
        <div class="card-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          <h2>Bot WhatsApp</h2>
          <span class="badge-coming-soon">Bientôt disponible</span>
        </div>

        <div class="wa-option">
          <div class="wa-option-text">
            <div class="wa-option-title">{{ whatsappEnabled ? '🟢 Bot actif' : '⏸️ Bot en pause' }}</div>
            <div class="wa-option-desc">{{ whatsappEnabled ? 'Les clients peuvent réserver via WhatsApp.' : 'Le bot ne répond plus aux messages WhatsApp.' }}</div>
          </div>
          <label class="toggle">
            <input type="checkbox" v-model="whatsappEnabled" />
            <span class="toggle-switch toggle-switch--green"></span>
          </label>
        </div>

        <div class="wa-option" :class="{ 'option-disabled': !whatsappEnabled }">
          <div class="wa-option-text">
            <div class="wa-option-title">Afficher les prix</div>
            <div class="wa-option-desc">Affiche le prix des prestations dans les messages WhatsApp.</div>
          </div>
          <label class="toggle">
            <input type="checkbox" v-model="whatsappShowPrices" :disabled="!whatsappEnabled" />
            <span class="toggle-switch toggle-switch--green"></span>
          </label>
        </div>
      </div>

      <!-- Réservation en ligne -->
      <div class="settings-card" :class="{ 'card-disabled': !onlineEnabled }">
        <div class="card-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          <h2>Réservation en ligne</h2>
          <span class="channel-badge" :class="onlineEnabled ? 'badge-active' : 'badge-paused'">
            {{ onlineEnabled ? 'Active' : 'En pause' }}
          </span>
        </div>

        <div class="wa-option">
          <div class="wa-option-text">
            <div class="wa-option-title">{{ onlineEnabled ? '🟢 Réservation active' : '⏸️ Réservation en pause' }}</div>
            <div class="wa-option-desc">{{ onlineEnabled ? 'Les clients peuvent réserver via le site Glambook.' : 'Les clients ne peuvent plus réserver en ligne pour ce salon.' }}</div>
          </div>
          <label class="toggle">
            <input type="checkbox" v-model="onlineEnabled" />
            <span class="toggle-switch toggle-switch--blue"></span>
          </label>
        </div>

        <div class="wa-option" :class="{ 'option-disabled': !onlineEnabled }">
          <div class="wa-option-text">
            <div class="wa-option-title">Afficher les prix</div>
            <div class="wa-option-desc">Affiche le prix des prestations sur la page de réservation en ligne.</div>
          </div>
          <label class="toggle">
            <input type="checkbox" v-model="onlineShowPrices" :disabled="!onlineEnabled" />
            <span class="toggle-switch toggle-switch--blue"></span>
          </label>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.settings-grid {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 720px;
}

.settings-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px 24px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}
.card-header h2 {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}
.card-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin: -8px 0 18px;
}

/* Horaires */
.hours-table { display: flex; flex-direction: column; gap: 8px; }
.hours-head { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; padding-bottom: 4px; border-bottom: 1px solid var(--border); }
.hours-row { display: grid; grid-template-columns: 120px 60px 1fr 1fr; align-items: center; gap: 12px; }
.hours-row.inactive { opacity: 0.45; }
.day-label { font-size: 13.5px; font-weight: 500; color: var(--text-main); }
.time-input {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  font-size: 13px;
  color: var(--text-main);
  background: var(--bg-main);
  width: 100%;
}
.time-input:disabled { opacity: 0.4; cursor: not-allowed; }
.time-input:focus { outline: none; border-color: var(--primary); }

/* Toggle */
.toggle { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; }
.toggle input { display: none; }
.toggle-switch { position: absolute; inset: 0; background: var(--border-strong); border-radius: 20px; cursor: pointer; transition: .2s; }
.toggle-switch::after { content: ''; position: absolute; width: 14px; height: 14px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: .2s; }
.toggle input:checked + .toggle-switch { background: var(--primary); }
.toggle input:checked + .toggle-switch::after { transform: translateX(16px); }

/* Fermetures */
.closure-add { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.closure-add .form-input { flex: 1; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; background: var(--bg-main); color: var(--text-main); }
.closure-dates { display: flex; gap: 10px; }
.date-field { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.date-field label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
.closure-bottom { display: flex; gap: 10px; }
.closure-list { display: flex; flex-direction: column; gap: 8px; }
.closure-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--bg-main); border: 1px solid var(--border); border-radius: 8px; }
.closure-date { font-size: 13.5px; font-weight: 600; color: var(--text-main); }
.closure-label { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.btn-remove { background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 4px; border-radius: 4px; display: flex; align-items: center; }
.btn-remove:hover { color: var(--red); background: var(--red-soft); }
.empty-closures { font-size: 13px; color: var(--text-muted); text-align: center; padding: 16px 0; }

/* Seuils */
.threshold-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid var(--border); }
.threshold-row:last-child { border-bottom: none; }
.threshold-row label { display: flex; align-items: center; gap: 7px; font-size: 13.5px; color: var(--text-main); font-weight: 500; }
.threshold-control { display: flex; align-items: center; gap: 10px; }
.btn-step { width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-main); font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-main); transition: background .15s; }
.btn-step:hover { background: var(--bg-teal-soft); }
.threshold-val { font-size: 18px; font-weight: 700; color: var(--primary); min-width: 24px; text-align: center; }
.threshold-unit { font-size: 13px; color: var(--text-muted); }

/* Card grisée quand désactivée */
.card-disabled { opacity: 0.6; }

/* Coming soon */
.card-coming-soon {
  opacity: 0.5;
  pointer-events: none;
  user-select: none;
  position: relative;
}
.badge-coming-soon {
  margin-left: auto;
  font-size: 11px; font-weight: 700; padding: 2px 10px;
  border-radius: 100px;
  background: var(--orange-soft); color: var(--orange);
  border: 1px solid rgba(217,119,6,.25);
}

/* Badge statut canal */
.channel-badge {
  margin-left: auto;
  font-size: 11px; font-weight: 700; padding: 2px 10px;
  border-radius: 100px;
}
.badge-active { background: var(--green-soft); color: var(--green); }
.badge-paused { background: var(--bg-soft); color: var(--text-muted); }

/* Option grisée */
.option-disabled { opacity: 0.4; pointer-events: none; }

/* Toggle bleu (réservation en ligne) */
.toggle-switch--blue { background: var(--border-strong); }
.toggle input:checked + .toggle-switch--blue { background: var(--blue); }

/* WhatsApp */
.wa-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
}
.wa-option:last-child { border-bottom: none; }
.wa-option.wa-paused { opacity: 0.7; }
.wa-option-title { font-size: 13.5px; font-weight: 600; color: var(--text-main); }
.wa-option-desc { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.toggle-switch--green { background: var(--border-strong); }
.toggle input:checked + .toggle-switch--green { background: var(--whatsapp); }
</style>
