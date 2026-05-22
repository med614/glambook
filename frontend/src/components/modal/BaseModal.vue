<template>
  <Transition name="modal">
    <div
      class="modal-overlay"
      :class="{ 'modal-overlay--dark': dark }"
      @click.self="close"
      @keydown.esc="close"
      role="presentation"
      tabindex="-1"
      ref="overlayRef"
    >
      <div
        class="modal"
        :class="{ 'modal--dark': dark }"
        role="dialog"
        aria-modal="true"
      >
        <div v-if="title" class="modal-header">
          <div class="modal-header-dot"></div>
          <span class="modal-title">{{ title }}</span>
          <button class="modal-close" @click="close" aria-label="Fermer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <slot />
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({ dark: Boolean, title: String })
const emit = defineEmits(['close'])
const close = () => emit('close')
const overlayRef = ref(null)

const onKeydown = (e) => {
  if (e.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  overlayRef.value?.focus()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>
