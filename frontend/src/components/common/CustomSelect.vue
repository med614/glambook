<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: [String, Number, null],
  options: {
    type: Array,
    default: () => []
  },
  placeholder: {
    type: String,
    default: 'Sélectionner...'
  },
  valueKey: {
    type: String,
    default: 'id'
  },
  labelKey: {
    type: String,
    default: 'name'
  },
  iconType: {
    type: String,
    default: 'funnel' // 'funnel' or 'none'
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)
const containerRef = ref(null)
const dropdownStyle = ref({})

function updateDropdownPosition() {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top
  const maxH = 260

  if (spaceBelow >= maxH || spaceBelow >= spaceAbove) {
    // Ouvrir vers le bas
    dropdownStyle.value = {
      position: 'fixed',
      top: rect.bottom + 4 + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      maxHeight: Math.min(maxH, spaceBelow - 8) + 'px',
      zIndex: 9999
    }
  } else {
    // Ouvrir vers le haut
    dropdownStyle.value = {
      position: 'fixed',
      bottom: window.innerHeight - rect.top + 4 + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      maxHeight: Math.min(maxH, spaceAbove - 8) + 'px',
      zIndex: 9999
    }
  }
}

// Normalize options to { value, label, disabled }
const normalizedOptions = computed(() => {
  return props.options.map(opt => {
    if (typeof opt === 'object' && opt !== null) {
      return {
        value: opt[props.valueKey] !== undefined ? opt[props.valueKey] : opt.value,
        label: opt[props.labelKey] !== undefined ? opt[props.labelKey] : opt.label,
        disabled: !!opt.disabled,
        hint: opt.hint || null
      }
    }
    return { value: opt, label: opt, disabled: false, hint: null }
  })
})

const selectedOption = computed(() => {
  return normalizedOptions.value.find(o => o.value === props.modelValue)
})

const selectedLabel = computed(() => {
  return selectedOption.value ? selectedOption.value.label : props.placeholder
})

function toggle() {
  if (props.disabled) return
  if (!isOpen.value) updateDropdownPosition()
  isOpen.value = !isOpen.value
}

function select(val, disabled) {
  if (disabled) return
  emit('update:modelValue', val)
  isOpen.value = false
}

function handleOutsideClick(e) {
  if (containerRef.value && !containerRef.value.contains(e.target)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick)
})
</script>

<template>
  <div class="custom-select" ref="containerRef">
    <!-- TRIGGER -->
    <div 
        class="trigger" 
        :class="{ 'is-open': isOpen, 'is-disabled': disabled, 'has-value': !!selectedOption }"
        @click="toggle"
    >
      <div class="trigger-left">
        <!-- Funnel Icon -->
        <svg v-if="iconType === 'funnel'" class="icon-funnel" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
        </svg>
        <span class="label">{{ selectedLabel }}</span>
      </div>
      
      <svg class="icon-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>

    <!-- DROPDOWN -->
    <transition name="pop">
      <div v-if="isOpen" class="dropdown" :style="dropdownStyle">
        <ul class="options-list">
          <li
            v-for="opt in normalizedOptions"
            :key="opt.value"
            class="option-item"
            :class="{ 'active': String(opt.value) === String(modelValue), 'option-disabled': opt.disabled }"
            @click="select(opt.value, opt.disabled)"
          >
            <span class="option-text">{{ opt.label }}</span>
            <span v-if="opt.hint" class="option-hint">{{ opt.hint }}</span>
            <svg v-else-if="String(opt.value) === String(modelValue)" class="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </li>
          <li v-if="normalizedOptions.length === 0" class="empty-state">
            Aucun résultat
          </li>
        </ul>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.custom-select {
  position: relative;
  width: 100%;
  user-select: none;
}

/* TRIGGER */
.trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 42px;
  padding: 0 12px;
  background: #fff;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.trigger:hover {
  border-color: #cbd5e1;
}

.trigger.is-open {
  border-color: var(--accent-teal);
  box-shadow: 0 0 0 3px rgba(74, 144, 164, 0.1);
}

.trigger.is-disabled {
    background: #f8fafc;
    cursor: not-allowed;
    opacity: 0.7;
}

.trigger-left {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
}

.icon-funnel {
  width: 16px;
  height: 16px;
  color: #94a3b8;
  flex-shrink: 0;
}

.label {
  font-size: 13.5px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.trigger.has-value .label {
    color: var(--text-main);
    font-weight: 500;
}

.icon-chevron {
  width: 12px;
  height: 12px;
  color: #94a3b8;
  transition: transform 0.2s;
  flex-shrink: 0;
}

.trigger.is-open .icon-chevron {
  transform: rotate(180deg);
}

/* DROPDOWN */
.dropdown {
  background: #fff;
  border: 1px solid #1e293b;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.15);
  padding: 4px;
  overflow-y: auto;
}

.options-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.option-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  font-size: 13.5px;
  color: var(--text-main);
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: 2px;
}

.option-item:last-child {
    margin-bottom: 0;
}

.option-disabled {
  opacity: 0.5;
  cursor: not-allowed;
  color: var(--text-muted);
}
.option-disabled:hover {
  background: transparent !important;
}

.option-hint {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #dc2626;
  background: #fee2e2;
  padding: 2px 6px;
  border-radius: 999px;
  flex-shrink: 0;
}

.option-item:hover {
  background: #D9A758; /* Gold on hover */
  color: #1e293b;
}

/* GOLD ACTIVE STATE */
.option-item.active {
  background: #D9A758; /* Exact Gold */
  color: #1e293b; /* Dark text like in image */
  font-weight: 600;
}

.icon-check {
  width: 14px;
  height: 14px;
  color: #475569; /* Slate 600 */
  flex-shrink: 0;
}

.option-item.active .icon-check {
    color: #1e293b;
}

.empty-state {
    padding: 12px;
    font-size: 12px;
    color: var(--text-muted);
    text-align: center;
}

/* Scrollbar */
.options-list::-webkit-scrollbar { width: 4px; }
.options-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }

/* Transitions */
.pop-enter-active, .pop-leave-active {
  transition: transform 0.15s ease, opacity 0.15s ease;
  transform-origin: top;
}
.pop-enter-from, .pop-leave-to {
  transform: scaleY(0.95);
  opacity: 0;
}
</style>
