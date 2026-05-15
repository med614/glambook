<template>
  <Transition name="modal">
    <div
      class="modal-overlay"
      @click.self="close"
      @keydown.esc="close"
      role="presentation"
      tabindex="-1"
      ref="overlayRef"
    >
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
      >
        <slot />
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

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
