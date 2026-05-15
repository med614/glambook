<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  modelValue: [String, Number, null],
  options: {
    type: Array,
    default: () => [] // Array of strings or objects { id, name }
  },
  placeholder: {
    type: String,
    default: 'Sélectionner ou taper...'
  },
  valueKey: {
    type: String,
    default: 'id'
  },
  labelKey: {
    type: String,
    default: 'name'
  }
})

const emit = defineEmits(['update:modelValue', 'select'])

const isOpen = ref(false)
const searchQuery = ref('')
const containerRef = ref(null)
const inputRef = ref(null)

// Normalize options
const normalizedOptions = computed(() => {
  return props.options.map(opt => {
    if (typeof opt === 'object' && opt !== null) {
      return {
        value: opt[props.valueKey] !== undefined ? opt[props.valueKey] : opt,
        label: opt[props.labelKey] !== undefined ? opt[props.labelKey] : opt,
        original: opt
      }
    }
    return { value: opt, label: opt, original: opt }
  })
})

// Filter options based on search query
const filteredOptions = computed(() => {
  if (!searchQuery.value) return normalizedOptions.value
  const query = searchQuery.value.toLowerCase()
  return normalizedOptions.value.filter(opt => 
    String(opt.label).toLowerCase().includes(query)
  )
})

// Sync internal query with modelValue initially or when changed externally
watch(() => props.modelValue, (val) => {
    // If val matches an option ID, show label
    // If val is just a string not in ID list, show it as text
    if (!val) {
        // searchQuery.value = '' // Don't clear if user is typing?
        return
    }

    const found = normalizedOptions.value.find(o => o.value === val)
    if (found) {
        if (!isOpen.value) searchQuery.value = found.label
    } else {
       // Assuming it's a free text value (or ID not found)
       // If modelValue is ID but not found in options, we might have an issue displaying label.
       // For this specific use case (Service Name), modelValue might be the name string itself? 
       // The requirement says "choose or type". 
       // If creating a new service, we probably send the name string.
       // If selecting existing, we might send ID or Name. 
       // Let's assume for Service we use NAME as value for now or handle both.
       
       // If we want to support both ID keys and free text, it's tricky.
       // Let's assume for this "Service" field, we treat it as a string input backed by suggestions.
       // so modelValue IS the string.
       if (!isOpen.value) searchQuery.value = val
    }
}, { immediate: true })

function onInput() {
  isOpen.value = true
  emit('update:modelValue', searchQuery.value)
}

function selectOption(opt) {
  searchQuery.value = opt.label
  emit('update:modelValue', opt.value) // Emit ID or Value
  emit('select', opt.original)
  isOpen.value = false
}

function handleOutsideClick(e) {
  if (containerRef.value && !containerRef.value.contains(e.target)) {
    isOpen.value = false
  }
}

function onFocus() {
    isOpen.value = true
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick)
})
</script>

<template>
  <div class="searchable-select" ref="containerRef">
    <div class="input-wrapper">
      <input
        ref="inputRef"
        type="text"
        class="search-input"
        :placeholder="placeholder"
        v-model="searchQuery"
        @input="onInput"
        @focus="onFocus"
      />
      <div class="icon-right" @click="isOpen = !isOpen">
         <svg class="icon-chevron" :class="{ 'rotate': isOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6" />
         </svg>
      </div>
    </div>

    <transition name="fade">
      <div v-if="isOpen && filteredOptions.length > 0" class="dropdown">
        <ul class="options-list">
          <li
            v-for="(opt, i) in filteredOptions"
            :key="i"
            class="option-item"
            @click="selectOption(opt)"
          >
            {{ opt.label }}
          </li>
        </ul>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.searchable-select {
  position: relative;
  width: 100%;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-input {
  width: 100%;
  padding: 10px 36px 10px 12px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
}

.search-input:focus {
  border-color: var(--accent-teal);
  box-shadow: 0 0 0 3px rgba(74, 144, 164, 0.1);
}

.icon-right {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}

.icon-chevron {
  width: 14px;
  height: 14px;
  color: #94a3b8;
  transition: transform 0.2s;
}

.icon-chevron.rotate {
  transform: rotate(180deg);
}

/* DROPDOWN */
.dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: 100%;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
  z-index: 2000;
  max-height: 200px;
  overflow-y: auto;
}

.options-list {
  list-style: none;
  padding: 4px;
  margin: 0;
}

.option-item {
  padding: 10px 12px;
  font-size: 13.5px;
  color: #334155;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.1s;
}

.option-item:hover {
  background: #f1f5f9;
  color: #0f172a;
}
</style>
