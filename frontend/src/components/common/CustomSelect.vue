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

  const dropW = Math.max(rect.width, 220)
  if (spaceBelow >= maxH || spaceBelow >= spaceAbove) {
    dropdownStyle.value = {
      position: 'fixed',
      top: rect.bottom + 4 + 'px',
      left: rect.left + 'px',
      width: dropW + 'px',
      maxHeight: Math.min(maxH, spaceBelow - 8) + 'px',
      zIndex: 9999
    }
  } else {
    dropdownStyle.value = {
      position: 'fixed',
      bottom: window.innerHeight - rect.top + 4 + 'px',
      left: rect.left + 'px',
      width: dropW + 'px',
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
        hint:   opt.hint   || null,
        badge:  opt.badge  || null,
        danger: !!opt.danger
      }
    }
    return { value: opt, label: opt, disabled: false, hint: null, badge: null, danger: false }
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
            :class="{ 'active': String(opt.value) === String(modelValue), 'option-disabled': opt.disabled, 'option-danger': opt.danger }"
            @click="select(opt.value, opt.disabled)"
          >
            <span class="option-text" style="flex:1;overflow:hidden;text-overflow:ellipsis">{{ opt.label }}</span>
            <span v-if="opt.hint" class="option-hint">{{ opt.hint }}</span>
            <span v-else-if="opt.badge" class="option-badge">{{ opt.badge }}</span>
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
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.trigger:hover {
  border-color: var(--border-strong);
}

.trigger.is-open {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-glow);
}

.trigger.is-disabled {
    background: var(--bg-soft);
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
  color: var(--text-light);
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
  color: var(--text-light);
  transition: transform 0.2s;
  flex-shrink: 0;
}

.trigger.is-open .icon-chevron {
  transform: rotate(180deg);
}

/* DROPDOWN */
.dropdown {
  background: var(--bg-card);
  border: 1px solid var(--border-strong);
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
  gap: 8px;
  padding: 9px 12px;
  font-size: 13px;
  color: var(--text-main);
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: 2px;
  white-space: nowrap;
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

.option-danger {
  color: var(--red);
  background: var(--red-soft);
}
.option-danger:hover {
  background: var(--red-soft) !important;
  color: var(--red);
}

.option-hint {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--red);
  background: var(--red-soft);
  padding: 2px 6px;
  border-radius: 999px;
  flex-shrink: 0;
}

.option-badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--green);
  background: var(--green-soft);
  border: 1px solid var(--green);
  padding: 2px 6px;
  border-radius: 999px;
  flex-shrink: 0;
}

.option-item:hover {
  background: var(--primary-soft);
  color: var(--primary);
}

.option-item.active {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 600;
}

.icon-check {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.option-item.active .icon-check {
    color: var(--primary);
}

.empty-state {
    padding: 12px;
    font-size: 12px;
    color: var(--text-muted);
    text-align: center;
}

/* Scrollbar */
.options-list::-webkit-scrollbar { width: 4px; }
.options-list::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 10px; }

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
