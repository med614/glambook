<script setup>
import { ref, watch, computed } from 'vue'
import BaseModal from '../modal/BaseModal.vue'
import CustomSelect from '../common/CustomSelect.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  service: { type: Object, default: null },
  categories: { type: Array, default: () => [] }
})

const emit = defineEmits(['save', 'close'])

const categoryId      = ref(null)
const name            = ref('')
const nameAr          = ref('')
const translating     = ref(false)
const duration        = ref('')
const price           = ref('')
const isLourd         = ref(false)
const whatsappEnabled = ref(false)
const errors     = ref({})
const submitting = ref(false)

const durationOptions = computed(() => {
  const opts = []
  for (let min = 15; min <= 240; min += 15) {
    const h = Math.floor(min / 60)
    const m = min % 60
    const label = h > 0 ? (m > 0 ? `${h}h${m.toString().padStart(2,'0')}` : `${h}h`) : `${min} min`
    opts.push({ id: min, name: label })
  }
  return opts
})

function resetForm(val) {
  if (!val) {
    categoryId.value = null
    name.value = ''
    nameAr.value = ''
    duration.value = ''
    price.value = ''
    isLourd.value = false
    whatsappEnabled.value = false
  } else {
    categoryId.value = val.category_id ?? null
    name.value = val.name || ''
    nameAr.value = val.name_ar || ''
    duration.value = val.duration_minutes || ''
    price.value = val.price != null ? String(val.price) : ''
    isLourd.value = !!val.is_heavy
    whatsappEnabled.value = !!val.whatsapp_enabled
  }
  errors.value = {}
}

watch(() => props.service, resetForm, { immediate: true })

// Réinitialise aussi à chaque ouverture du modal
watch(() => props.open, (isOpen) => { if (isOpen) resetForm(props.service) })

watch(categoryId, () => { if (categoryId.value) delete errors.value.category_id })
watch(name, () => { if (name.value?.trim()) delete errors.value.name })
watch(duration, () => { if (duration.value) delete errors.value.duration_minutes })

function validate() {
  const e = {}
  if (!name.value?.trim()) e.name = 'Le nom est obligatoire'
  if (!duration.value) e.duration_minutes = 'La durée est obligatoire'
  errors.value = e
  return Object.keys(e).length === 0
}

function save() {
  if (!validate()) return
  submitting.value = true
  emit('save', {
    id: props.service?.id ?? null,
    category_id: categoryId.value || null,
    name: name.value.trim(),
    name_ar: nameAr.value.trim() || null,
    duration_minutes: Number(duration.value),
    price: price.value !== '' ? Number(price.value) : null,
    is_heavy: isLourd.value,
    whatsapp_enabled: whatsappEnabled.value
  })
  submitting.value = false
}

async function translate() {
  if (!name.value.trim() || translating.value) return
  translating.value = true
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(name.value.trim())}&langpair=fr|ar`)
    const json = await res.json()
    const translated = json?.responseData?.translatedText
    if (translated && json.responseStatus === 200) nameAr.value = translated
  } catch {}
  translating.value = false
}

function close() {
  if (!submitting.value) emit('close')
}
</script>

<template>
  <BaseModal v-if="open" @close="close">
    <header class="modal-title">{{ service ? 'Modifier la prestation' : 'Nouvelle prestation' }}</header>

    <div class="modal-body">

      <!-- Nom -->
      <div class="form-row">
        <div class="form-group flex-1">
          <label>Nom *</label>
          <input v-model="name" type="text" placeholder="Ex: Coupe femme…" class="form-input" :class="{ error: errors.name }" />
          <span v-if="errors.name" class="form-error">{{ errors.name }}</span>
        </div>
        <div class="form-group flex-1">
          <label>الاسم بالعربية 🇲🇦</label>
          <div class="ar-input-wrap">
            <input v-model="nameAr" type="text" placeholder="مثال: قص الشعر…" class="form-input ar-input" dir="rtl" />
            <button type="button" class="btn-translate" @click="translate" :disabled="!name.trim() || translating" :title="translating ? 'Traduction…' : 'Traduire automatiquement'">
              <span v-if="translating">⏳</span>
              <span v-else>🌐</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Catégorie + Durée -->
      <div class="form-row">
        <div class="form-group flex-1">
          <label>Catégorie</label>
          <CustomSelect v-model="categoryId" :options="categories" placeholder="Choisir…" />
        </div>
        <div class="form-group flex-1">
          <label>Durée *</label>
          <CustomSelect v-model="duration" :options="durationOptions" placeholder="Sélectionner…" />
          <span v-if="errors.duration_minutes" class="form-error">{{ errors.duration_minutes }}</span>
        </div>
      </div>

      <!-- Prix -->
      <div class="form-group">
        <label>Prix (DH)</label>
        <div class="price-input-wrap">
          <input v-model="price" type="number" min="0" step="1" placeholder="Sur devis" class="form-input" />
          <span class="price-suffix">DH</span>
        </div>
      </div>

      <!-- Service lourd -->
      <div class="toggle-field">
        <div>
          <div class="toggle-label">Service lourd</div>
          <div class="toggle-sub">Nécessite plus d'attention ou de temps de préparation</div>
        </div>
        <label class="toggle">
          <input type="checkbox" v-model="isLourd" />
          <span class="slider"></span>
        </label>
      </div>

      <!-- WhatsApp -->
      <label class="checkbox-field">
        <input type="checkbox" v-model="whatsappEnabled" class="checkbox-input" />
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366" style="flex-shrink:0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        <span class="checkbox-label">Disponible sur WhatsApp</span>
      </label>

    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" @click="close" :disabled="submitting">Annuler</button>
      <button class="btn btn-primary" @click="save" :disabled="submitting">
        {{ submitting ? 'Enregistrement…' : (service ? 'Enregistrer' : 'Créer') }}
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

.form-row { display: flex; gap: 14px; }
.flex-1 { flex: 1; min-width: 0; }

.price-input-wrap { position: relative; }
.price-input-wrap .form-input { padding-right: 30px; }
.price-suffix { position: absolute; right: 11px; top: 50%; transform: translateY(-50%); font-size: 13px; color: var(--text-muted); pointer-events: none; }

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

.toggle { position: relative; display: inline-block; width: 40px; height: 22px; flex-shrink: 0; }
.toggle input { display: none; }
.slider { position: absolute; inset: 0; background: #cbd5e1; border-radius: 22px; cursor: pointer; transition: .25s; }
.slider:before { content: ''; position: absolute; width: 16px; height: 16px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: .25s; }
.toggle input:checked + .slider { background: var(--primary); }
.toggle input:checked + .slider:before { transform: translateX(18px); }
.toggle input:checked + .slider--green { background: #25D366; }

.checkbox-field {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  cursor: pointer;
  user-select: none;
}
.checkbox-input {
  width: 15px;
  height: 15px;
  accent-color: #25D366;
  cursor: pointer;
  flex-shrink: 0;
}
.checkbox-label {
  font-size: 13.5px;
  color: var(--text-main);
}
.ar-input-wrap { position: relative; }
.ar-input-wrap .form-input { padding-left: 36px; }
.ar-input { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; }
.btn-translate {
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 2px;
  line-height: 1;
  opacity: 0.7;
  transition: opacity .15s;
}
.btn-translate:hover:not(:disabled) { opacity: 1; }
.btn-translate:disabled { cursor: default; opacity: 0.4; }
</style>
