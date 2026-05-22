<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  actions: {
    type: Array,
    required: true,
    // Each action: { label: string, onClick: function, class: string, icon: string (icon name or SVG) }
  }
})

const isOpen = ref(false)
const containerRef = ref(null)
const menuPosition = ref({ top: 0, left: 0, width: 0 })

function updatePosition() {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  menuPosition.value = {
    top: rect.bottom + window.scrollY,
    left: rect.right + window.scrollX,
    width: rect.width
  }
}

function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
  } else {
    removeListeners()
  }
}

function removeListeners() {
  window.removeEventListener('scroll', updatePosition, true)
  window.removeEventListener('resize', updatePosition)
}

function handleAction(callback) {
  isOpen.value = false
  removeListeners()
  callback()
}

function handleOutsideClick(e) {
  if (containerRef.value && !containerRef.value.contains(e.target)) {
    const dropdownMenu = document.querySelector('.dropdown-menu-portal')
    if (dropdownMenu && dropdownMenu.contains(e.target)) return
    
    isOpen.value = false
    removeListeners()
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleOutsideClick)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleOutsideClick)
  removeListeners()
})

</script>

<template>
  <div class="dropdown-actions" ref="containerRef">
    <button class="trigger-btn" @click.stop="toggle" :class="{ 'active': isOpen }" aria-label="Actions">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="19" r="1" />
      </svg>
    </button>

    <Teleport to="body">
      <transition name="pop">
        <div 
          v-if="isOpen" 
          class="dropdown-menu dropdown-menu-portal"
          :style="{ 
            position: 'absolute',
            top: `${menuPosition.top + 6}px`,
            left: `${menuPosition.left}px`,
            transform: 'translateX(-100%)'
          }"
        >
          <button
            v-for="(action, index) in actions"
            :key="index"
            class="menu-item"
            :class="action.class"
            @click.stop="handleAction(action.onClick)"
          >
            <span v-if="action.icon" class="item-icon">
              <!-- If icon starts with <svg, it's raw SVG, otherwise it's an AppIcon name -->
              <span v-if="action.icon.startsWith('<svg')" v-html="action.icon"></span>
              <AppIcon v-else :name="action.icon" :size="16" />
            </span>
            {{ action.label }}
          </button>
        </div>
      </transition>
    </Teleport>
  </div>
</template>


<style scoped>
.dropdown-actions {
  position: relative;
  display: inline-block;
}

.trigger-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s;
}

.trigger-btn:hover, .trigger-btn.active {
  background: var(--bg-card-soft);
  color: var(--text-main);
  border-color: var(--border-soft);
}

.dropdown-menu {
  min-width: 160px;
  background: var(--bg-card);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.15);
  z-index: 9999;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  font-size: 13.5px;
  color: var(--text-main);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}

.menu-item:hover {
  background: var(--bg-card-soft);
}

.menu-item.danger {
  color: var(--red);
}

.menu-item.danger:hover {
  background: var(--red-soft);
}

.item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  opacity: 0.7;
}

/* Transitions */
.pop-enter-active, .pop-leave-active {
  transition: transform 0.15s ease, opacity 0.15s ease;
  transform-origin: top right;
}
.pop-enter-from, .pop-leave-to {
  transform: scale(0.95);
  opacity: 0;
}
</style>
