<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import photoBrushing from '@/assets/freestyle/brushing.png'

const API = import.meta.env.VITE_API_URL || 'https://glambook-backend-4bbl.onrender.com'
const ORG = '77748ee2-0bba-429b-a696-f710ed523e7e'

/* ── API ── */
const services     = ref([])
const staffList    = ref([])
const slots        = ref([])
const slotsLoading = ref(false)
const slotsClosed  = ref(false)

/* ── Stepper ── */
const currentStep    = ref(1)
const selectedSvcs   = ref([])          // [{ id, name, price, duration, category, categoryId, staffId }]
const selectedCategory = ref(null)
const openCategories = ref(new Set())
const selectedSlot   = ref(null)

/* ── Form ── */
const fn = ref(''); const ln = ref(''); const ph = ref(''); const dt = ref('')
const submitting  = ref(false)
const toast       = ref({ show: false, error: false, msg: '' })
const fieldErrors = ref({ fn: false, ph: false })
const bookingFormEl = ref(null)

/* ── Nav scroll ── */
const navScrolled = ref(false)

const todayISO   = new Date().toISOString().split('T')[0]
const stepLabels = ['Prestations', 'Spécialiste', 'Date & Heure', 'Confirmation']

/* ── Computed ── */
const servicesByCategory = computed(() => {
  const map = new Map()
  for (const svc of services.value) {
    const cat = svc.category || 'Autres'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat).push(svc)
  }
  return [...map.entries()].map(([name, svcs]) => ({ name, svcs }))
})
const totalPrice    = computed(() => selectedSvcs.value.reduce((s, v) => s + (v.price    || 0), 0))
const totalDuration = computed(() => selectedSvcs.value.reduce((s, v) => s + (v.duration || 0), 0))
const canProceed    = computed(() => {
  if (currentStep.value === 1) return selectedSvcs.value.length > 0
  if (currentStep.value === 3) return !!dt.value && !!selectedSlot.value
  return true
})

/* ── Navigation ── */
function nextStep() { if (canProceed.value) currentStep.value++ }
function prevStep() { if (currentStep.value > 1) currentStep.value-- }

/* ── Services ── */
function toggleSvc(svc) {
  const idx = selectedSvcs.value.findIndex(s => s.id === svc.id)
  if (idx >= 0) { selectedSvcs.value.splice(idx, 1) }
  else { selectedSvcs.value.push({ ...svc, staffId: null }) }
  selectedSlot.value = null; slots.value = []
}
function isSvcSelected(svc) { return selectedSvcs.value.some(s => s.id === svc.id) }
function initials(name) { return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }
function toggleCat(cat) {
  const s = openCategories.value
  s.has(cat) ? s.delete(cat) : s.add(cat)
  openCategories.value = new Set(s)
}
function catHasSelected(group) { return group.svcs.some(s => isSvcSelected(s)) }

/* ── Staff par service ── */
function staffForSvc(svc) {
  if (!svc.categoryId) return staffList.value
  const filtered = staffList.value.filter(s => s.categoryIds.includes(svc.categoryId))
  return filtered.length ? filtered : staffList.value
}
function setStaffForSvc(svcId, staffId) {
  const svc = selectedSvcs.value.find(s => s.id === svcId)
  if (svc) svc.staffId = staffId
}
function staffName(staffId) {
  return staffList.value.find(s => s.id === staffId)?.name || 'Sans préférence'
}

function formatDateDisplay(iso) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

/* ── API calls ── */
async function loadServices() {
  try {
    const data = await fetch(`${API}/booking/${ORG}/services`).then(r => r.json())
    services.value = data.map(s => ({ id: s.id, name: s.name, price: s.price || null, duration: s.duration_minutes || null, category: s.category?.name || 'Autres', categoryId: s.category_id || null }))
  } catch {}
}
async function loadStaff() {
  try {
    const data = await fetch(`${API}/booking/${ORG}/staff`).then(r => r.json())
    staffList.value = data.map(s => ({ id: s.id, name: s.name, categoryIds: (s.staff_categories || []).map(sc => sc.category_id) }))
  } catch {}
}
async function loadSlots() {
  if (!dt.value) return
  slots.value = []; selectedSlot.value = null; slotsClosed.value = false; slotsLoading.value = true
  try {
    let url = `${API}/booking/${ORG}/slots?date=${dt.value}`
    if (selectedSvcs.value[0]) url += `&serviceId=${selectedSvcs.value[0].id}`
    const data = await fetch(url).then(r => r.json())
    if (data.closed) { slotsClosed.value = true; return }
    slots.value = data.slots || []
  } catch {} finally { slotsLoading.value = false }
}

async function submit() {
  fieldErrors.value = { fn: !fn.value.trim(), ph: !ph.value.trim() }
  if (!fn.value.trim() || !ph.value.trim()) return
  submitting.value = true
  try {
    const res = await fetch(`${API}/booking/${ORG}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fn.value.trim(),
        last_name: ln.value.trim(),
        phone: ph.value.trim(),
        date: dt.value,
        time: selectedSlot.value,
        services: selectedSvcs.value.map(s => ({ serviceId: s.id, staffId: s.staffId || null }))
      })
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erreur ${res.status}`)
    showToast('RDV confirmé ! Nous vous recontactons rapidement.', false)
    setTimeout(() => {
      currentStep.value = 1
      selectedSvcs.value = []; selectedSlot.value = null
      fn.value = ln.value = ph.value = dt.value = ''; slots.value = []; selectedCategory.value = null
      fieldErrors.value = { fn: false, ph: false }
    }, 800)
  } catch (e) {
    showToast(e.message || 'Une erreur est survenue.', true)
  } finally { submitting.value = false }
}

let toastTimer = null
function showToast(msg, error = false) {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = { show: true, error, msg }
  toastTimer = setTimeout(() => { toast.value.show = false }, 5000)
}

function goBook() {
  bookingFormEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function onScroll() { navScrolled.value = window.scrollY > 40 }

onMounted(() => {
  loadServices(); loadStaff()
  window.addEventListener('scroll', onScroll)
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <div class="fs-page">

    <!-- Grain texture -->
    <div class="grain"></div>

    <!-- Particules flottantes -->
    <div class="particles" aria-hidden="true">
      <span class="p p1"></span><span class="p p2"></span><span class="p p3"></span>
      <span class="p p4"></span><span class="p p5"></span><span class="p p6"></span>
    </div>

    <!-- ── NAV ── -->
    <nav class="fs-nav" :class="{ scrolled: navScrolled }">
      <svg class="nav-logo" viewBox="0 0 280 84" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="navSw" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#c30010"/>
            <stop offset="70%" stop-color="#c30010"/>
            <stop offset="100%" stop-color="rgba(195,0,16,0)"/>
          </linearGradient>
        </defs>
        <text x="4" y="56" font-family="'Great Vibes', cursive" font-size="58">
          <tspan fill="#c30010">F</tspan><tspan fill="#ffffff">ree</tspan><tspan fill="#c30010">S</tspan><tspan fill="#ffffff">tyle</tspan>
        </text>
        <path d="M6,64 C24,74 62,78 110,71 C128,68 136,61 138,55" stroke="url(#navSw)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      </svg>
      <div class="nav-right">
        <a class="nav-tel" href="tel:0661935412">📞 06 61 935 412</a>
        <button class="nav-btn" @click="goBook()">Réserver</button>
      </div>
    </nav>

    <!-- ── HERO ── -->
    <section class="hero" :style="`background-image: url(${photoBrushing})`">
      <div class="hero-overlay"></div>

      <div class="container">

        <!-- LEFT -->
        <div class="left">

          <!-- Badge pulsé -->
          <div class="badge anim-1">
            <span class="pulse-dot"></span>
            Salon Expert L'Oréal PRO
          </div>

          <!-- Logo -->
          <div class="logo-wrap anim-2">
            <svg class="logo-svg" viewBox="0 0 430 128" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="heroSw" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"  stop-color="#c30010"/>
                  <stop offset="72%" stop-color="#c30010"/>
                  <stop offset="100%" stop-color="rgba(195,0,16,0)"/>
                </linearGradient>
              </defs>
              <text x="6" y="82" font-family="'Great Vibes', cursive" font-size="84">
                <tspan fill="#c30010">F</tspan><tspan fill="#ffffff">ree</tspan><tspan fill="#c30010">S</tspan><tspan fill="#ffffff">tyle</tspan>
              </text>
              <path d="M10,93 C38,108 96,114 170,105 C196,100 208,91 210,83" stroke="url(#heroSw)" stroke-width="2.6" fill="none" stroke-linecap="round"/>
              <line x1="6" y1="114" x2="424" y2="114" stroke="rgba(255,255,255,0.15)" stroke-width="0.7"/>
              <text x="215" y="124" font-family="'Montserrat', sans-serif" font-size="6.2" fill="rgba(255,255,255,0.7)" text-anchor="middle" letter-spacing="2.4">CENTRE DE BEAUTÉ · HICHAM &amp; SANAE LEBBAR · FÈS</text>
            </svg>
          </div>

          <!-- H1 -->
          <h1 class="anim-3">
            L'Art de la Beauté<br>
            <span>Version Premium</span>
          </h1>

          <!-- Subtitle -->
          <p class="subtitle anim-4">
            Depuis plus de 10 ans, Free Style sublime votre style à Fès. Un univers raffiné pensé par Hicham &amp; Sanae Lebbar pour une expérience beauté haut de gamme.
          </p>

          <!-- Stats strip -->
          <div class="stats-strip anim-5">
            <div class="stat">
              <div class="stat-v">58K</div>
              <div class="stat-l">Abonnés</div>
            </div>
            <div class="stat-div"></div>
            <div class="stat">
              <div class="stat-v">+10</div>
              <div class="stat-l">Ans d'expertise</div>
            </div>
            <div class="stat-div"></div>
            <div class="stat">
              <div class="stat-v">L'Oréal</div>
              <div class="stat-l">Expert PRO</div>
            </div>
          </div>

          <!-- Info cards -->
          <div class="info-grid">
            <div class="info-card anim-6">
              <h3>Adresse</h3>
              <p>Avenue Allal El Fassi<br>Fès, Maroc</p>
            </div>
            <div class="info-card anim-7">
              <h3>Horaires</h3>
              <p>Tous les jours<br>9h00 – 20h00</p>
            </div>
            <div class="info-card anim-8">
              <h3>Téléphones</h3>
              <p><a href="tel:0661935412">06 61 935 412</a><br><a href="tel:0671432700">06 71 432 700</a></p>
            </div>
            <div class="info-card anim-9">
              <h3>Instagram</h3>
              <p><a class="insta" href="https://www.instagram.com/hichamlebbarofficial/" target="_blank">@hichamlebbarofficial</a><br>58K abonnés</p>
            </div>
          </div>

        </div>

        <!-- RIGHT : Booking -->
        <div class="booking" ref="bookingFormEl">
          <div class="booking-glow"></div>
          <div class="booking-ring"></div>

          <h2>Réserver un Rendez-vous</h2>
          <p class="booking-sub">Prenez rendez-vous facilement et profitez d'une expérience beauté exclusive.</p>

          <!-- Stepper -->
          <div class="stepper-bar">
            <div v-for="(label, i) in stepLabels" :key="i" class="s-step" :class="{ active: currentStep === i+1, done: currentStep > i+1 }">
              <div class="s-num"><span v-if="currentStep > i+1">✓</span><span v-else>{{ i+1 }}</span></div>
              <div class="s-label">{{ label }}</div>
            </div>
          </div>

          <!-- STEP 1 -->
          <div v-if="currentStep === 1" class="step-body">
            <div v-if="!services.length" class="svc-empty">Chargement…</div>

            <div v-else class="cat-sections">
              <div v-for="group in servicesByCategory" :key="group.name" class="cat-section"
                :class="{ open: openCategories.has(group.name), 'has-sel': catHasSelected(group) }">

                <!-- En-tête cliquable -->
                <div class="cat-header" @click="toggleCat(group.name)">
                  <div class="cat-header-left">
                    <span class="cat-name">{{ group.name }}</span>
                    <span v-if="catHasSelected(group)" class="cat-sel-dot"></span>
                  </div>
                  <div class="cat-header-right">
                    <span class="cat-count">{{ group.svcs.length }}</span>
                    <svg class="cat-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </div>
                </div>

                <!-- Services (dépliés) -->
                <div class="svc-list" v-show="openCategories.has(group.name)">
                  <div v-for="svc in group.svcs" :key="svc.id"
                    class="svc-row" :class="{ sel: isSvcSelected(svc) }" @click="toggleSvc(svc)">
                    <div class="svc-check-col" :class="{ on: isSvcSelected(svc) }">
                      <svg v-if="isSvcSelected(svc)" width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" stroke-width="1.8" stroke-linecap="round"/></svg>
                    </div>
                    <div class="svc-info">
                      <div class="svc-name">{{ svc.name }}</div>
                      <div class="svc-dur">{{ svc.duration ? svc.duration + ' min' : '' }}</div>
                    </div>
                    <div class="svc-price">{{ svc.price ? svc.price + ' MAD' : '—' }}</div>
                  </div>
                </div>

              </div>
            </div>

            <!-- Résumé sélection -->
            <div v-if="selectedSvcs.length" class="svc-total">
              <div class="svc-total-tags">
                <span v-for="svc in selectedSvcs" :key="svc.id" class="svc-tag" @click.stop="toggleSvc(svc)">
                  {{ svc.name }} ×
                </span>
              </div>
              <div class="svc-total-right">
                <span class="svc-total-dur">{{ totalDuration }} min</span>
                <span class="svc-total-price">{{ totalPrice }} MAD</span>
              </div>
            </div>
          </div>

          <!-- STEP 2 -->
          <div v-else-if="currentStep === 2" class="step-body">
            <div class="svc-staff-blocks">
              <div v-for="svc in selectedSvcs" :key="svc.id" class="svc-staff-block">

                <!-- En-tête de la prestation -->
                <div class="svc-staff-header">
                  <span class="svc-staff-name">{{ svc.name }}</span>
                  <span class="svc-staff-cat">{{ svc.category }}</span>
                </div>

                <!-- Grille des spécialistes filtrés par catégorie -->
                <div class="staff-grid">
                  <div class="staff-card" :class="{ sel: svc.staffId === null }" @click="setStaffForSvc(svc.id, null)">
                    <div class="staff-av staff-av--any">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                    </div>
                    <div class="staff-name">Sans préférence</div>
                  </div>
                  <div v-for="s in staffForSvc(svc)" :key="s.id"
                    class="staff-card" :class="{ sel: svc.staffId === s.id }"
                    @click="setStaffForSvc(svc.id, s.id)">
                    <div class="staff-av">{{ initials(s.name) }}</div>
                    <div class="staff-name">{{ s.name }}</div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <!-- STEP 3 -->
          <div v-else-if="currentStep === 3" class="step-body">
            <div class="fg">
              <label class="fl">Date souhaitée</label>
              <input class="fi" type="date" :min="todayISO" v-model="dt" @change="loadSlots()">
            </div>
            <div class="time-lbl">Créneau horaire</div>
            <div class="slots">
              <div v-if="slotsLoading"     class="slot off" style="grid-column:1/-1;text-align:center">Chargement…</div>
              <div v-else-if="slotsClosed" class="slot off" style="grid-column:1/-1;text-align:center">Salon fermé ce jour</div>
              <div v-else-if="!dt"         class="slot off" style="grid-column:1/-1;text-align:center">Sélectionnez une date</div>
              <div v-else-if="!slots.length" class="slot off" style="grid-column:1/-1;text-align:center">Aucun créneau</div>
              <div v-else v-for="s in slots" :key="s" class="slot" :class="{ on: selectedSlot === s }" @click="selectedSlot = s">{{ s }}</div>
            </div>
          </div>

          <!-- STEP 4 -->
          <div v-else-if="currentStep === 4" class="step-body">
            <div class="recap">
              <div v-for="svc in selectedSvcs" :key="svc.id" class="recap-svc-row">
                <div class="recap-row">
                  <span>{{ svc.name }}</span><span>{{ svc.price ? svc.price + ' MAD' : '—' }}</span>
                </div>
                <div class="recap-staff-line">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                  {{ staffName(svc.staffId) }}
                </div>
              </div>
              <div class="recap-divider"></div>
              <div class="recap-row recap-total"><span>Total</span><span>{{ totalPrice }} MAD</span></div>
              <div class="recap-row"><span>Date</span><span>{{ formatDateDisplay(dt) }}</span></div>
              <div class="recap-row"><span>Heure</span><span>{{ selectedSlot }}</span></div>
            </div>
            <div class="fg-row">
              <div class="fg">
                <label class="fl">Prénom *</label>
                <input class="fi" :class="{ err: fieldErrors.fn }" type="text" placeholder="Fatima" v-model="fn" @input="fieldErrors.fn=false">
              </div>
              <div class="fg">
                <label class="fl">Nom</label>
                <input class="fi" type="text" placeholder="Alaoui" v-model="ln">
              </div>
            </div>
            <div class="fg">
              <label class="fl">WhatsApp / Téléphone *</label>
              <input class="fi" :class="{ err: fieldErrors.ph }" type="tel" placeholder="+212 6 XX XX XX XX" v-model="ph" @input="fieldErrors.ph=false">
            </div>
          </div>

          <!-- Navigation -->
          <div class="step-nav">
            <button v-if="currentStep > 1" class="btn-back" @click="prevStep()">← Retour</button>
            <button v-if="currentStep < 4" class="btn-next" :disabled="!canProceed" @click="nextStep()">Suivant →</button>
            <button v-if="currentStep === 4" class="btn-submit" :disabled="submitting" @click="submit()">
              {{ submitting ? 'Envoi…' : 'Confirmer la réservation' }}
            </button>
          </div>
          <p v-if="currentStep === 4" class="form-note">Annulation gratuite jusqu'à 24h avant</p>
        </div>

      </div>
    </section>

    <footer class="bottom">
      © 2026 Free Style — Centre de Beauté · Hicham &amp; Sanae Lebbar · Fès, Maroc
    </footer>

    <div class="toast" :class="{ show: toast.show, error: toast.error }">{{ toast.msg }}</div>

  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Montserrat:wght@300;400;500;600&family=Great+Vibes&display=swap');
</style>

<style scoped>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── PAGE ── */
.fs-page {
  font-family: 'Montserrat', sans-serif;
  background: #070707;
  color: #fff;
  overflow-x: hidden;
  min-height: 100vh;
}

/* ── GRAIN ── */
.grain {
  position: fixed; inset: 0; z-index: 9998; pointer-events: none;
  opacity: .032;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-repeat: repeat;
}

/* ── PARTICLES ── */
.particles { position: fixed; inset: 0; pointer-events: none; z-index: 1; }
.p { position: absolute; border-radius: 50%; background: rgba(195,0,16,.18); }
.p1 { width:5px;  height:5px;  top:18%; left:12%;  animation: fp 7s ease-in-out infinite; }
.p2 { width:3px;  height:3px;  top:55%; left:6%;   animation: fp 9s ease-in-out infinite 1.5s; }
.p3 { width:7px;  height:7px;  top:78%; left:22%;  animation: fp 6s ease-in-out infinite 3s; }
.p4 { width:4px;  height:4px;  top:25%; left:88%;  animation: fp 8s ease-in-out infinite 0.8s; }
.p5 { width:6px;  height:6px;  top:65%; left:82%;  animation: fp 10s ease-in-out infinite 2s; }
.p6 { width:3px;  height:3px;  top:42%; left:48%;  animation: fp 7s ease-in-out infinite 4s; }
@keyframes fp { 0%,100%{transform:translateY(0) scale(1);opacity:.18} 50%{transform:translateY(-22px) scale(1.3);opacity:.45} }

/* ── NAV ── */
.fs-nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  padding: 20px 52px;
  display: flex; align-items: center; justify-content: space-between;
  background: linear-gradient(to bottom, rgba(0,0,0,.82), transparent);
  transition: background .4s, padding .4s, backdrop-filter .4s;
}
.fs-nav.scrolled {
  padding: 14px 52px;
  background: rgba(5,5,5,.92);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(255,255,255,.06);
}
.nav-logo { height: 38px; width: auto; }
.nav-right { display: flex; align-items: center; gap: 28px; }
.nav-tel { font-size: 12px; letter-spacing: .8px; color: rgba(255,255,255,.78); text-decoration: none; transition: color .3s; }
.nav-tel:hover { color: #fff; }
.nav-btn {
  padding: 9px 22px; border: 1px solid rgba(195,0,16,.65); background: transparent;
  color: #fff; font-family: 'Montserrat', sans-serif; font-size: 11px; font-weight: 500;
  letter-spacing: 1.2px; text-transform: uppercase; border-radius: 50px;
  cursor: pointer; transition: all .3s;
}
.nav-btn:hover { background: #c30010; border-color: #c30010; }

/* ── HERO ── */
.hero {
  min-height: 100vh;
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 100px 20px 60px;
  position: relative;
}
.hero-overlay {
  position: absolute; inset: 0;
  background:
    linear-gradient(to right, rgba(0,0,0,.92) 38%, rgba(0,0,0,.58) 100%),
    radial-gradient(ellipse at top right, rgba(195,0,16,.22), transparent 45%),
    radial-gradient(ellipse at bottom left, rgba(0,0,0,.5), transparent 50%);
  pointer-events: none;
}

/* ── LAYOUT ── */
.container {
  position: relative; z-index: 2;
  width: 100%; max-width: 1240px;
  display: grid;
  grid-template-columns: minmax(0,1fr) minmax(340px,500px);
  gap: 64px;
  align-items: center;
}

/* ── LEFT ── */
.left { display: flex; flex-direction: column; }

/* Staggered entry animations */
.anim-1 { animation: fadeUp .7s ease .1s both; }
.anim-2 { animation: fadeUp .8s ease .25s both; }
.anim-3 { animation: fadeUp .8s ease .4s both; }
.anim-4 { animation: fadeUp .8s ease .55s both; }
.anim-5 { animation: fadeUp .8s ease .7s both; }
.anim-6 { animation: fadeUp .8s ease .85s both; }
.anim-7 { animation: fadeUp .8s ease .95s both; }
.anim-8 { animation: fadeUp .8s ease 1.05s both; }
.anim-9 { animation: fadeUp .8s ease 1.15s both; }

/* Badge */
.badge {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 18px;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 50px;
  background: rgba(255,255,255,.06);
  backdrop-filter: blur(10px);
  color: #d9d9d9;
  font-size: 11px; letter-spacing: 1.5px;
  margin-bottom: 22px;
  width: fit-content;
}
.pulse-dot {
  width: 7px; height: 7px; border-radius: 50%; background: #c30010;
  position: relative; flex-shrink: 0;
  animation: pulseDot 2s ease-in-out infinite;
}
.pulse-dot::after {
  content: ''; position: absolute; inset: -4px; border-radius: 50%;
  border: 1px solid rgba(195,0,16,.5);
  animation: pulseDot 2s ease-in-out infinite .3s;
}
@keyframes pulseDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.5)} }

/* Logo */
.logo-wrap { margin-bottom: 20px; }
.logo-svg  { width: min(400px, 88vw); height: auto; filter: drop-shadow(0 0 28px rgba(195,0,16,.3)); }

/* H1 */
h1 {
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(46px, 5.5vw, 72px);
  line-height: .97;
  font-weight: 600;
  margin-bottom: 20px;
  color: #fff;
  text-shadow: 0 2px 32px rgba(0,0,0,.95), 0 1px 6px rgba(0,0,0,1);
}
h1 span {
  color: #c30010;
  font-style: italic;
  text-shadow: 0 2px 20px rgba(0,0,0,.95);
}

/* Subtitle */
.subtitle {
  font-size: 14px; line-height: 1.85;
  color: rgba(255,255,255,.78);
  max-width: 560px;
  margin-bottom: 28px;
  text-shadow: 0 1px 8px rgba(0,0,0,.8);
}

/* ── STATS STRIP ── */
.stats-strip {
  display: flex; align-items: center;
  padding: 18px 0;
  margin-bottom: 28px;
  border-top: 1px solid rgba(255,255,255,.09);
  border-bottom: 1px solid rgba(255,255,255,.09);
}
.stat { flex: 1; text-align: center; }
.stat-v { font-family: 'Cormorant Garamond', serif; font-size: 26px; font-weight: 700; color: #fff; line-height: 1; }
.stat-l { font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,255,255,.5); margin-top: 4px; }
.stat-div { width: 1px; height: 32px; background: rgba(255,255,255,.14); }

/* ── INFO CARDS ── */
.info-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; }
.info-card {
  padding: 18px 20px;
  border-radius: 18px;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.08);
  backdrop-filter: blur(12px);
  transition: transform .3s, border-color .3s, box-shadow .3s;
  position: relative; overflow: hidden;
}
.info-card::before {
  content: ''; position: absolute; inset: 0; border-radius: 18px;
  background: linear-gradient(135deg, rgba(195,0,16,.08), transparent);
  opacity: 0; transition: opacity .4s;
}
.info-card:hover::before { opacity: 1; }
.info-card:hover { transform: translateY(-4px); border-color: rgba(195,0,16,.3); box-shadow: 0 12px 32px rgba(0,0,0,.3); }
.info-card h3 { font-size: 10px; letter-spacing: 2px; color: #c30010; margin-bottom: 8px; text-transform: uppercase; }
.info-card p  { font-size: 13px; line-height: 1.7; color: #e8e8e8; }
.info-card a  { color: #e8e8e8; text-decoration: none; }
.insta { color: #ff4f5e !important; font-weight: 600; }

/* ── BOOKING PANEL ── */
.booking {
  position: relative; overflow: hidden;
  background: rgba(8,8,8,.96);
  border: 1px solid rgba(195,0,16,.2);
  border-radius: 32px;
  padding: 40px 36px;
  backdrop-filter: blur(24px);
  box-shadow: 0 24px 80px rgba(0,0,0,.6);
  animation: fadeUp 1s ease .2s both, bookingGlow 4s ease-in-out infinite;
}
@keyframes bookingGlow {
  0%,100% { border-color: rgba(195,0,16,.2); box-shadow: 0 24px 80px rgba(0,0,0,.6); }
  50%      { border-color: rgba(195,0,16,.5); box-shadow: 0 24px 80px rgba(0,0,0,.6), 0 0 40px rgba(195,0,16,.18); }
}
.booking-glow {
  position: absolute; top: -100px; right: -100px;
  width: 220px; height: 220px;
  background: radial-gradient(circle, rgba(195,0,16,.25), transparent 70%);
  filter: blur(14px); pointer-events: none; animation: rotGlow 8s linear infinite;
}
.booking-ring {
  position: absolute; inset: -1px; border-radius: 33px; pointer-events: none;
  background: conic-gradient(from 0deg, rgba(195,0,16,.6) 0deg, transparent 80deg, transparent 280deg, rgba(195,0,16,.6) 360deg);
  animation: spinRing 6s linear infinite;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  -webkit-mask-composite: destination-out;
  padding: 1px;
  opacity: .7;
}
@keyframes spinRing { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
@keyframes rotGlow  { 0%{top:-100px;right:-100px} 50%{top:-80px;right:-80px} 100%{top:-100px;right:-100px} }

.booking h2 { font-family: 'Cormorant Garamond', serif; font-size: 32px; font-weight: 600; margin-bottom: 6px; color: #fff; }
.booking-sub { font-size: 13px; line-height: 1.6; color: #aaa; margin-bottom: 22px; }

/* ── STEPPER ── */
.stepper-bar { display:flex; align-items:flex-start; margin-bottom:22px; padding-bottom:18px; border-bottom:1px solid rgba(255,255,255,.07); }
.s-step { flex:1; display:flex; flex-direction:column; align-items:center; gap:5px; position:relative; }
.s-step:not(:last-child)::after { content:''; position:absolute; top:12px; left:calc(50% + 12px); width:calc(100% - 24px); height:1px; background:rgba(255,255,255,.1); transition:background .4s; }
.s-step.done:not(:last-child)::after { background:#c30010; }
.s-num { width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; border:1px solid rgba(255,255,255,.18); color:rgba(255,255,255,.4); transition:all .35s; }
.s-step.active .s-num { background:#c30010; border-color:#c30010; color:#fff; box-shadow:0 0 14px rgba(195,0,16,.5); }
.s-step.done   .s-num { background:rgba(195,0,16,.2); border-color:#c30010; color:#c30010; }
.s-label { font-size:9px; letter-spacing:1px; text-transform:uppercase; color:rgba(255,255,255,.32); text-align:center; transition:color .35s; }
.s-step.active .s-label { color:rgba(255,255,255,.82); }
.s-step.done   .s-label { color:rgba(195,0,16,.65); }

/* ── STEP BODY ── */
.step-body { min-height: 260px; max-height: 380px; overflow-y: auto; padding-right: 4px; }
.step-body::-webkit-scrollbar { width: 3px; }
.step-body::-webkit-scrollbar-thumb { background: rgba(195,0,16,.4); border-radius: 99px; }

/* ── STEP 1 : catégories + services ── */
.cat-sections { display:flex; flex-direction:column; gap:5px; margin-bottom:10px; }

/* En-tête catégorie — accordéon */
.cat-section { border-radius: 12px; margin-bottom: 4px; border: 1px solid rgba(255,255,255,.06); transition: border-color .25s; }
.cat-section.open    { border-color: rgba(195,0,16,.25); }
.cat-section.has-sel { border-color: rgba(195,0,16,.35); }

.cat-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 11px 14px;
  cursor: pointer;
  background: rgba(255,255,255,.03);
  transition: background .2s;
  user-select: none;
}
.cat-header:hover { background: rgba(255,255,255,.06); }
.cat-section.open .cat-header { background: rgba(195,0,16,.07); }

.cat-header-left  { display: flex; align-items: center; gap: 8px; }
.cat-header-right { display: flex; align-items: center; gap: 8px; }

.cat-name {
  font-size: 11px; font-weight: 600; letter-spacing: 1.5px;
  text-transform: uppercase; color: rgba(255,255,255,.82);
  transition: color .2s;
}
.cat-section.open .cat-name,
.cat-section.has-sel .cat-name { color: #fff; }

.cat-sel-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #c30010;
  box-shadow: 0 0 6px rgba(195,0,16,.7); flex-shrink: 0;
}

.cat-count {
  min-width: 18px; height: 18px; border-radius: 50%;
  background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 600; color: rgba(255,255,255,.5); line-height: 1;
  padding: 0 4px;
}
.cat-section.has-sel .cat-count {
  background: rgba(195,0,16,.2); border-color: rgba(195,0,16,.4); color: #fff;
}

.cat-chevron {
  color: rgba(255,255,255,.35);
  transition: transform .25s ease, color .2s;
}
.cat-section.open .cat-chevron { transform: rotate(180deg); color: #c30010; }

/* Service list */
.svc-list { display:flex; flex-direction:column; padding: 4px 8px 8px; }
.svc-row {
  display:flex; align-items:center; gap:10px;
  padding:10px 12px; border:1px solid transparent;
  border-radius:12px; cursor:pointer; transition:all .2s;
  margin-bottom: 3px;
}
.svc-row:hover { background:rgba(255,255,255,.04); border-color:rgba(255,255,255,.1); }
.svc-row.sel { background:rgba(195,0,16,.08); border-color:rgba(195,0,16,.35); }

/* Checkbox col */
.svc-check-col {
  width:18px; height:18px; border-radius:5px; flex-shrink:0;
  border:1px solid rgba(255,255,255,.2);
  display:flex; align-items:center; justify-content:center;
  transition:all .2s;
}
.svc-check-col.on { background:#c30010; border-color:#c30010; box-shadow:0 0 8px rgba(195,0,16,.5); }

.svc-info { flex:1; min-width:0; }
.svc-name { font-size:13px; font-weight:500; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.svc-dur  { font-size:10px; color:rgba(255,255,255,.38); margin-top:2px; }
.svc-price { font-size:12px; font-weight:600; color:rgba(255,255,255,.75); flex-shrink:0; }
.svc-row.sel .svc-price { color:#fff; }

.svc-empty { font-size:12px; color:rgba(255,255,255,.4); padding:20px 0; text-align:center; }

/* Résumé sélection */
.svc-total {
  display:flex; flex-direction:column; gap:8px;
  padding:10px 14px; background:rgba(195,0,16,.09);
  border:1px solid rgba(195,0,16,.28); border-radius:12px;
  margin-top:4px;
}
.svc-total-tags { display:flex; flex-wrap:wrap; gap:5px; }
.svc-tag {
  display:inline-flex; align-items:center;
  padding:3px 9px; border-radius:50px;
  background:rgba(195,0,16,.18); border:1px solid rgba(195,0,16,.35);
  font-size:10px; font-weight:500; color:#fff;
  cursor:pointer; transition:background .2s;
}
.svc-tag:hover { background:rgba(195,0,16,.35); }
.svc-total-right { display:flex; justify-content:space-between; align-items:center; padding-top:6px; border-top:1px solid rgba(255,255,255,.07); }
.svc-total-dur { font-size:11px; color:rgba(255,255,255,.55); }
.svc-total-price { font-size:13px; font-weight:700; color:#fff; }

/* Staff par service */
.svc-staff-blocks { display:flex; flex-direction:column; gap:18px; }
.svc-staff-block { display:flex; flex-direction:column; gap:10px; }
.svc-staff-header { display:flex; align-items:center; gap:8px; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,.07); }
.svc-staff-name { font-size:13px; font-weight:600; color:#fff; flex:1; }
.svc-staff-cat {
  font-size:9px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase;
  padding:3px 9px; border-radius:50px;
  background:rgba(195,0,16,.12); border:1px solid rgba(195,0,16,.28); color:#c30010;
}
.staff-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.staff-card { display:flex; flex-direction:column; align-items:center; gap:7px; padding:13px 6px; border:1px solid rgba(255,255,255,.08); border-radius:14px; cursor:pointer; transition:all .22s; text-align:center; }
.staff-card:hover { border-color:rgba(195,0,16,.3); background:rgba(255,255,255,.03); transform:translateY(-2px); }
.staff-card.sel { border-color:#c30010; background:rgba(195,0,16,.1); box-shadow:0 0 14px rgba(195,0,16,.2); }
.staff-av { width:40px; height:40px; border-radius:50%; background:rgba(195,0,16,.15); border:1px solid rgba(195,0,16,.3); display:flex; align-items:center; justify-content:center; font-family:'Cormorant Garamond',serif; font-size:.95rem; font-weight:700; color:#fff; }
.staff-av--any { background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.14); color:rgba(255,255,255,.6); }
.staff-name { font-size:10px; font-weight:500; color:#fff; }

/* Slots */
.time-lbl { font-size:10px; letter-spacing:2px; text-transform:uppercase; color:rgba(255,255,255,.52); margin-bottom:10px; }
.slots { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:14px; }
.slot { padding:9px 4px; text-align:center; border:1px solid rgba(255,255,255,.1); border-radius:10px; font-size:12px; cursor:pointer; transition:all .25s; color:rgba(255,255,255,.78); }
.slot:hover:not(.off) { border-color:rgba(195,0,16,.5); color:#fff; background:rgba(195,0,16,.08); }
.slot.on { border-color:#c30010; color:#fff; background:rgba(195,0,16,.18); box-shadow:0 0 10px rgba(195,0,16,.3); }
.slot.off { opacity:.22; cursor:not-allowed; text-decoration:line-through; }

/* Fields */
.fg { display:flex; flex-direction:column; gap:7px; margin-bottom:13px; }
.fg-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.fl { font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:rgba(255,255,255,.52); }
.fi { width:100%; padding:13px 15px; background:#111; border:1px solid rgba(255,255,255,.09); border-radius:13px; color:#fff; font-size:14px; font-family:'Montserrat',sans-serif; outline:none; transition:.3s; }
.fi::placeholder { color:rgba(255,255,255,.28); }
.fi:focus { border-color:#c30010; box-shadow:0 0 0 3px rgba(195,0,16,.14); }
.fi.err { border-color:#e74c3c; }

/* Recap */
.recap { background:rgba(195,0,16,.06); border:1px solid rgba(195,0,16,.18); border-radius:16px; padding:14px 16px; margin-bottom:16px; display:flex; flex-direction:column; gap:8px; }
.recap-svc-row { display:flex; flex-direction:column; gap:3px; }
.recap-row { display:flex; justify-content:space-between; gap:12px; font-size:12px; color:rgba(255,255,255,.8); }
.recap-staff-line { display:flex; align-items:center; gap:5px; font-size:10px; color:rgba(255,255,255,.42); padding-left:2px; }
.recap-divider { height:1px; background:rgba(255,255,255,.07); margin:2px 0; }
.recap-total { font-weight:700; color:#fff; font-size:13px; }

/* Navigation buttons */
.step-nav { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:18px; }
.btn-back { background:transparent; border:1px solid rgba(255,255,255,.16); color:rgba(255,255,255,.68); padding:11px 18px; border-radius:13px; font-family:'Montserrat',sans-serif; font-size:11px; letter-spacing:.5px; cursor:pointer; transition:.25s; }
.btn-back:hover { border-color:rgba(255,255,255,.35); color:#fff; }
.btn-next,
.btn-submit {
  flex:1; position:relative; overflow:hidden;
  padding:14px 20px; border:none; border-radius:13px;
  background:linear-gradient(135deg, #c30010, #e8001a);
  color:#fff; font-family:'Montserrat',sans-serif;
  font-size:13px; font-weight:600; letter-spacing:.8px;
  cursor:pointer; transition:transform .25s, box-shadow .25s;
}
.btn-next::after,
.btn-submit::after {
  content:''; position:absolute; top:0; left:-200px; width:120px; height:100%;
  background:linear-gradient(90deg, transparent, rgba(255,255,255,.28), transparent);
  animation:shine 3s infinite linear;
}
.btn-next:hover,
.btn-submit:hover { transform:translateY(-2px); box-shadow:0 12px 32px rgba(195,0,16,.42); }
.btn-next:disabled,
.btn-submit:disabled { opacity:.42; pointer-events:none; }
.form-note { margin-top:10px; text-align:center; font-size:10px; letter-spacing:.4px; color:rgba(255,255,255,.38); }

/* ── FOOTER ── */
.bottom { padding:26px 20px; text-align:center; border-top:1px solid rgba(255,255,255,.06); color:#666; font-size:12px; }

/* ── TOAST ── */
.toast { position:fixed; bottom:26px; right:26px; z-index:9999; background:#c30010; color:#fff; padding:13px 22px; font-size:12px; font-weight:500; letter-spacing:.4px; border-radius:13px; transform:translateY(80px); opacity:0; transition:all .42s cubic-bezier(.4,0,.2,1); }
.toast.show { transform:none; opacity:1; }
.toast.error { background:#1e1e1e; border:1px solid rgba(255,255,255,.1); }

/* ── KEYFRAMES ── */
@keyframes fadeUp  { from{opacity:0;transform:translateY(32px)} to{opacity:1;transform:translateY(0)} }
@keyframes shine   { 0%{left:-200px} 100%{left:120%} }

/* ══════════════════════════════════════
   RESPONSIVE
══════════════════════════════════════ */
@media (max-width: 1024px) {
  .hero { padding: 80px 24px 48px; background-attachment: scroll; }
  .container { grid-template-columns: 1fr; gap: 0; }
  .booking { order: -1; margin-bottom: 48px; border-radius: 24px; padding: 32px 28px; }
  .fs-nav { padding: 16px 28px; }
  .logo-svg { width: min(340px, 82vw); }
  h1 { font-size: clamp(40px, 7vw, 58px); }
  .info-grid { grid-template-columns: 1fr 1fr; }
  .staff-grid { grid-template-columns: repeat(2,1fr); }
}

@media (max-width: 640px) {
  .hero { padding: 0; background-attachment: scroll; align-items: flex-start; }
  .container { gap: 0; }
  .booking { order: -1; border-radius: 0; border: none; border-bottom: 1px solid rgba(255,255,255,.06); padding: 70px 18px 32px; margin-bottom: 0; backdrop-filter: none; }
  .booking-ring { display: none; }
  .booking h2 { font-size: 26px; }
  .left { padding: 32px 18px 36px; }
  .logo-svg { width: min(260px, 78vw); }
  h1 { font-size: clamp(34px, 9vw, 46px); }
  .subtitle { font-size: 13px; }
  .stats-strip { padding: 14px 0; }
  .stat-v { font-size: 22px; }
  .stat-l { font-size: 8px; }
  .info-grid { grid-template-columns: 1fr; gap: 10px; }
  .info-card { padding: 14px 16px; border-radius: 14px; }
  .s-label { display: none; }
  .svc-list { max-height: 210px; }
  .slots { grid-template-columns: repeat(3,1fr); }
  .fg-row { grid-template-columns: 1fr; }
  .fi { padding: 12px 13px; font-size: 13px; border-radius: 11px; }
  .btn-next, .btn-submit { font-size: 12px; padding: 13px; border-radius: 11px; }
  .btn-back { font-size: 11px; padding: 11px 14px; border-radius: 11px; }
  .fs-nav { padding: 14px 18px; }
  .nav-tel { display: none; }
  .toast { bottom: 14px; right: 14px; left: 14px; text-align: center; border-radius: 11px; }
  .bottom { font-size: 11px; padding: 22px 16px 32px; }
}
</style>
