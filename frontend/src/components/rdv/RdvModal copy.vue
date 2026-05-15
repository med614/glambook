<script setup>
import { ref, computed, watch } from 'vue'
import BaseModal from '@/components/modal/BaseModal.vue'
import { findClientByPhone } from '@/services/clients.service'


    /* ==============================
       MODE
    ============================== */
    const isEditMode = computed(() => !!props.rdv)
    
 

      /* ==============================
       ACTIONS
    ============================== */
    function enableClientEdit() {
    
      forceEditClient.value = true
    }

/* ==============================
   PROPS / EMITS
============================== */
const props = defineProps({
  open: Boolean,
  rdv: Object,
  services: Array,
  categories: Array,
  subcategories: Array,
  staff: Array   // 👈 AJOUT
})

const emit = defineEmits(['close', 'save'])

/* ==============================
   FORM STATE
============================== */
const clientName = ref('')
const clientLastName = ref('')

const categoryId = ref(null)
const subcategoryId = ref(null)

const selectedServiceId = ref(null)
const selectedServices = ref([])
const staffId = ref(null)
const clientPhone = ref('')

const forceEditClient = ref(false)

const isExternal = ref(false)


const clientId = ref(null)

const clientDetected = ref(false)
const errors = ref({
  firstName: null,
  date: null,
  time: null,
  services: null
})
const showStaffWarning = ref(false)

/* ==============================
 DATE / TIME
============================== */
const appointmentDate = ref(
  new Date().toISOString().slice(0, 10)
)

const appointmentTime = ref('09:00')

/* ==============================
   TIME SLOTS (30 min)
============================== */
const timeSlots = computed(() => {
  const slots = []
  const startHour = 8
  const endHour = 20

  for (let h = startHour; h <= endHour; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
    if (h !== endHour) {
      slots.push(`${String(h).padStart(2, '0')}:30`)
    }
  }
  return slots
})

function isValidPhone(phone) {
  if (!phone) return false

  const digits = phone.replace(/\D/g, '')

  // 0 + 9 chiffres
  return /^0\d{9}$/.test(digits)
}

/* ==============================
   FILTERED DATA
============================== */
const filteredSubcategories = computed(() => {
  if (!categoryId.value) return props.subcategories
  return props.subcategories.filter(
    sc => sc.category_id === categoryId.value
  )
})

const filteredServices = computed(() => {
  return props.services.filter(s => {
    if (categoryId.value && s.category_id !== categoryId.value) return false
    if (subcategoryId.value && s.subcategory_id !== subcategoryId.value) return false
    return true
  })
})
function formatLastName(value) {
  if (!value) return ''
  return value.toUpperCase()
}
function capitalizeWords(value) {
  if (!value) return ''

  return value
    .toLowerCase()
    .split(/([\s-'])/)
    .map(part =>
      /^[a-zà-ÿ]/i.test(part)
        ? part.charAt(0).toUpperCase() + part.slice(1)
        : part
    )
    .join('')
}

watch(clientName, () => {
  if (clientName.value.trim()) errors.value.firstName = null
})

watch(clientPhone, (val) => {
  // si aucune erreur téléphone → rien à faire
  if (!errors.value?.phone) return



  // si le format devient valide → on enlève l’erreur
  if (isValidPhone(val)) {
    errors.value.clientPhone = null
  }
})

watch(appointmentDate, () => {
  if (appointmentDate.value) errors.value.date = null
})

watch(appointmentTime, () => {
  if (appointmentTime.value) errors.value.time = null
})

watch(selectedServices, () => {
  if (selectedServices.value.length) errors.value.services = null
}, { deep: true })

function validate() {
  let valid = true

  // reset
  errors.value = {
    firstName: null,
    date: null,
    time: null,
    services: null,
    phone: null
  }

// 📞 téléphone optionnel
if (clientPhone.value && !isValidPhone(clientPhone.value)) {
  errors.value.clientPhone = 'Format invalide (ex: 06 12 34 56 78)'
  valid = false
}

  if (!clientName.value.trim()) {
    errors.value.firstName = 'Le prénom est obligatoire'
    valid = false
  }

  if (!appointmentDate.value) {
    errors.value.date = 'La date est obligatoire'
    valid = false
  }

  if (!appointmentTime.value) {
    errors.value.time = 'L’heure est obligatoire'
    valid = false
  }

  if (!selectedServices.value.length) {
    errors.value.services = 'Ajoutez au moins une prestation'
    valid = false
  }

  return valid
}


function formatPhone(value) {
  if (!value) return ''

  // garde uniquement les chiffres
  const digits = value.replace(/\D/g, '').slice(0, 10)

  // format FR : 06 12 34 56 78
  return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
}

const hadDetectedClient = ref(false)
watch(clientPhone, async (val) => {
  const phone = val?.replace(/\s/g, '')

  // 🔑 À chaque modification du téléphone, on sort du mode édition client
  forceEditClient.value = false

  let client = null
  try {
    if (phone && phone.length >= 10) {
      client = await findClientByPhone(phone)
    }
  } catch (e) {
    console.error('CLIENT DETECTION ERROR 👉', e)
  }

  /* =========================
     CAS 1 — téléphone vide / incomplet
  ========================= */
  if (!phone || phone.length < 10) {
    // 👉 on ne vide nom/prénom QUE si on sort d’un client existant
    if (hadDetectedClient.value) {
      clientName.value = ''
      clientLastName.value = ''
    }

    clientDetected.value = false
    clientId.value = null
    hadDetectedClient.value = false
    return
  }

  /* =========================
     CAS 2 — client existant détecté
  ========================= */
  if (client) {
    clientDetected.value = true
    clientId.value = client.id
    hadDetectedClient.value = true

    // pré-remplissage auto
    clientName.value = client.name
    clientLastName.value = client.last_name || ''
    return
  }

  /* =========================
     CAS 3 — téléphone valide MAIS client inexistant
  ========================= */
  clientDetected.value = false
  clientId.value = null

  // 👉 on vide UNIQUEMENT si on sort d’un client existant
  if (hadDetectedClient.value) {
    clientName.value = ''
    clientLastName.value = ''
  }

  hadDetectedClient.value = false
})
/* ==============================
   ACTIONS
============================== */
function addService() {
  if (!selectedServiceId.value) return

  const service = props.services.find(s => s.id === selectedServiceId.value)
  if (!service) return

  selectedServices.value.push(service)
  selectedServiceId.value = null
}

function removeService(index) {
  selectedServices.value.splice(index, 1)
}
function save() {
  // 1️⃣ Validation des champs obligatoires
  const isValid = validate()
  if (!isValid) return

  // 2️⃣ Staff non affecté → warning / confirmation
  if (!staffId.value) {
    showStaffWarning.value = true
    return
  }

  // 3️⃣ Tout est OK → confirmation finale
  confirmSave()
}
function confirmSave() {
  const start_time = `${appointmentDate.value}T${appointmentTime.value}:00`

  emit('save', {

    id: props.rdv?.id || null,

    client_id: clientId.value || null,
    client: {
      name: clientName.value,
      last_name: clientLastName.value,
      phone: clientPhone.value || null
    },
    staff_id: staffId.value,
    start_time,
    is_external: isExternal.value,
    services: selectedServices.value.map(s => s.id)

  })

  showStaffWarning.value = false
}

/* ==============================
   INIT (EDIT)
============================== */
watch(
  () => props.rdv,
  (val) => {
    if (!val) {
      // CREATE
      clientName.value = ''
      clientLastName.value = ''
      clientPhone.value=''
      appointmentDate.value = new Date().toISOString().slice(0, 10)
      appointmentTime.value = '09:00'
      selectedServices.value = []
      staffId.value = null
      isExternal.value = false
      return
    }


    clientId.value = val.client?.id || null
    // EDIT
    clientName.value = val.client?.name || ''
    clientLastName.value = val.client?.last_name || ''
    clientPhone.value = formatPhone(val.client?.phone || '')
    isExternal.value = !!val.is_external


    // 🕒 Date / heure
    if (val.start_time) {
      appointmentDate.value = val.start_time.slice(0, 10)
      appointmentTime.value = val.start_time.slice(11, 16)
    }

    // ✅ PRESTATIONS (déjà corrigé)
    selectedServices.value = Array.isArray(val.appointment_services)
      ? val.appointment_services
        .map(a => a.service)
        .filter(Boolean)
      : []

    // ✅ STAFF (CORRECTION ICI)
    staffId.value = val.staff?.id ?? null
  },
  { immediate: true }
)
</script>

<template>
  <BaseModal v-if="open" @close="$emit('close')">

    <header class="modal-title">
      {{ rdv ? 'Modifier un RDV' : 'Ajouter un RDV' }}
    </header>

    <div class="modal-body">

      <!-- CLIENT -->
      <div class="form-box">

        <!-- CLIENT -->
        <div class="form-group-client">
          <label>Client</label>

          <div class="client-fields">

            <!-- Téléphone : toujours éditable -->
            <div v-if="!isEditMode">
            <input :value="clientPhone" @input="clientPhone = formatPhone($event.target.value)" type="tel"
              inputmode="tel" placeholder="Téléphone"
              :readonly="isEditMode && !forceEditClient"
  :class="{ readonly: isEditMode && !forceEditClient && clientDetected}"
              />
            </div>
              
              <div v-if="isEditMode">

                <input :value="clientPhone" @input="clientPhone = formatPhone($event.target.value)" type="tel"
              inputmode="tel" placeholder="Téléphone"
              :readonly="clientDetected && !forceEditClient"
              :class="{ readonly: clientDetected && !forceEditClient }" />
              </div>


            <!-- Prénom -->
            <input v-model="clientName" placeholder="Prénom" 
            @input="clientName = capitalizeWords($event.target.value)"
            :readonly="clientDetected && !forceEditClient"
              :class="{ readonly: clientDetected && !forceEditClient }" />

            <!-- Nom -->
            <input v-model="clientLastName" placeholder="Nom"
            
            :readonly="clientDetected && !forceEditClient"
            @input="clientLastName = formatLastName($event.target.value)"
            :class="{ readonly: clientDetected && !forceEditClient }" />


            <!-- Erreur -->
            <p v-if="errors.firstName" class="form-error">
              {{ errors.firstName }}
            </p>
            <p v-if="errors.clientPhone" class="form-error">
              {{ errors.clientPhone }}
            </p>
          </div>
        </div>

           <!-- 🔵 MODE MODIFICATION -->
           <div v-if="isEditMode && clientDetected && !forceEditClient  " class="client-detected-row">
            <button class="edit-client-btn locked" @click="enableClientEdit">
              Modifier le client
            </button>
          </div>

        <div v-if="clientDetected && !isEditMode" class="client-detected-row">
          <span class="client-detected-text">
            Client existant détecté
          </span>




        </div>
      </div>
      
      <div class="form-box">
      <!-- DATE + HEURE -->
      <div class="form-group">
        <label>Date & heure</label>

        <div class="date-time-row">
          <input type="date" v-model="appointmentDate" />

          <p v-if="errors.date" class="form-error">
            {{ errors.date }}
          </p>

          <select v-model="appointmentTime">
            <option v-for="t in timeSlots" :key="t" :value="t">
              {{ t }}
            </option>
          </select>
        </div>

    
 
      </div>
 <!-- RDV EXTERNE -->
<div class="external-row">
  <label class="external-toggle">
    <input type="checkbox" v-model="isExternal" />
    <span>Rendez-vous externe</span>
  </label>

</div>
</div>

      
      <!-- STAFF -->
      <div class="form-box">
      <div class="form-group">
        
        <label>Staff</label>
        <select v-model="staffId">
          <option :value="null">Non affecté</option>
          <option v-for="s in staff" :key="s.id" :value="s.id">
            {{ s.name }}
          </option>
        </select>
      </div>
      </div>

      <div class="form-box">
        <div class="form-box-title">
          <label>Choix Prestations</label>
        </div>
        <div class="services-filters">

          <!-- FILTRES -->
          <div class="form-group">
            <label>Catégorie</label>
            <select v-model="categoryId">
              <option :value="null">Toutes</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">
                {{ c.name }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>Sous-catégorie</label>
            <select v-model="subcategoryId">
              <option :value="null">Toutes</option>
              <option v-for="sc in filteredSubcategories" :key="sc.id" :value="sc.id">
                {{ sc.name }}
              </option>
            </select>
          </div>

          <!-- SERVICES -->
          <div class="form-group">
            <label>Prestation</label>
            <select v-model="selectedServiceId">
              <option disabled :value="null">Choisir une prestation</option>
              <option v-for="s in filteredServices" :key="s.id" :value="s.id">
                {{ s.name }} ({{ s.duration_minutes }} min)
              </option>
            </select>
          </div>
          <p v-if="errors.services" class="form-error">
            {{ errors.services }}
          </p>
          <button class="add-btn" @click="addService">
            + Ajouter une prestation
          </button>

          <!-- LISTE DES PRESTATIONS -->
          <ul class="list">
            <li v-for="(s, i) in selectedServices" :key="i" class="main-line">
              {{ s.name }}
              <button class="remove-x-btn" @click="removeService(i)">✕</button>
            </li>
          </ul>

        </div>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn-secondary-modal" @click="$emit('close')">Annuler</button>
      <button class="btn-primary-modal" @click="save">Enregistrer</button>
    </div>
    <BaseModal v-if="showStaffWarning" @close="showStaffWarning = false">
      <header class="modal-title">
        Confirmer le RDV
      </header>

      <div class="modal-body">
        <p class="warning-text">
          Aucun staff n’est affecté à ce rendez-vous.<br />
          Voulez-vous continuer quand même ?
        </p>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary-modal" @click="showStaffWarning = false">
          Revenir
        </button>

        <button class="btn-primary-modal warning" @click="confirmSave">
          Continuer sans staff
        </button>
      </div>
    </BaseModal>
  </BaseModal>
</template>

<style scoped>
/* ==============================
   DATE + TIME ROW
============================== */
.date-time-row {
  display: grid;
  grid-template-columns: 1fr 90px;
  gap: 10px;
  align-items: center;
}

.services-filters {


  grid-template-columns: 1fr 1fr;
}

.services-select {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: end;

}

/* ==============================
   Form BOX
============================== */
.form-box {
  border: 1px solid var(--border-soft);
  border-radius: 12px;

  background: var(--bg-card-soft);
  display: flex;
  flex-direction: column;
  padding: 10px;

}

.form-box-title label {
  font-size: 11.5px;
  color: var(--text-muted);
  font-weight: bold;
  padding: 0;
  margin: 0;
}

.modal .form-group {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  align-items: center;

}

.client-fields {

  padding: 0;
  margin: 0;
}

.client-fields input {

  margin-bottom: 10px;
  /* espace avec le tableau */
}

.modal .form-group-client {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  align-items: center;
  padding: 0;
  margin: 0;


}

.modal .form-group-client input,
.modal .form-group-client select,
.modal .form-group-client textarea,
.modal .form-group-client .readonly {
  background: var(--bg-card-soft);
  border: 1px solid var(--border-soft);
  color: var(--text-main);
  font-size: 12.5px;
  padding: 8px 10px;
  border-radius: 8px;
  width: 100%;
}

.client-detected {
  font-size: 11.5px;
  color: var(--accent-green);
  margin-left: 110px;
  /* aligné avec les inputs */
}

.warning-text {
  font-size: 13px;
  color: var(--text-main);
  line-height: 1.4;
}

.btn-primary-modal.warning {
  border-color: #f59e0b;
  color: #f59e0b;
}

.btn-primary-modal.warning:hover {
  background: rgba(245, 158, 11, 0.12);
}

.readonly {
  background: var(--bg-card-soft);
  opacity: 0.7;
  cursor: not-allowed;
}

.client-detected-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.client-detected-text {
  font-size: 11.5px;
  color: var(--accent-blue);
}

.edit-client-btn {
  background: transparent;
  border: 1px solid var(--border-soft);
  color: var(--text-muted);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.edit-client-btn:hover {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
}

.client-detected-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
  font-size: 12px;
}



.edit-client-btn {
  background: transparent;
  border: 1px solid var(--border-soft);
  color: var(--text-muted);
  font-size: 11.5px;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
}



/* 🔒 MODE VERROUILLAGE */
.edit-client-btn.danger {
  border-color: #ff5f5f;
  color: #ff5f5f;
}

.edit-client-btn.danger:hover {
  background: rgba(255, 95, 95, 0.1);
}

.edit-client-btn.locked {
  border-color: #6b7c93;
  /* bleu-gris */
  color: #6b7c93;
}

.edit-client-btn.locked:hover {
  background: rgba(107, 124, 147, 0.12);
}

.external-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  color: #6b7c93; /* bleu-gris */
  cursor: pointer;
}

.external-toggle input {
  accent-color: #6b7c93;
  cursor: pointer;
}

.external-hint {
  font-size: 11.5px;
  color: var(--text-muted);
  margin-left: 22px; /* aligné sous le label */
  margin-top: 2px;
}
</style>