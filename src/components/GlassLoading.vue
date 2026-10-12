<template>
  <Transition name="glass-reveal" appear>
    <div v-if="active" class="glass-loading" role="status" aria-live="polite">
      <div class="glass-loading-indicator">
        <span class="glass-loading-orbit" aria-hidden="true">
          <span class="glass-loading-wave" />
          <span class="glass-loading-wave wave-delayed" />
          <span class="glass-loading-core" />
        </span>
        <span class="glass-loading-label">{{ label }}</span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{ active: boolean; label: string }>()
</script>

<style scoped>
.glass-loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  overflow: hidden;
  pointer-events: none;
  background: color-mix(in srgb, var(--md-sys-color-surface) 58%, transparent);
  backdrop-filter: blur(8px) saturate(115%);
  -webkit-backdrop-filter: blur(8px) saturate(115%);
}

.glass-loading-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 24px;
}

.glass-loading-orbit {
  position: relative;
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
}

.glass-loading-wave {
  position: absolute;
  inset: 0;
  border: 1px solid color-mix(in srgb, var(--md-sys-color-primary) 45%, transparent);
  border-radius: 50%;
  background: radial-gradient(circle, transparent 40%, color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent));
  animation: glass-diffuse 2.4s ease-out infinite;
}

.wave-delayed { animation-delay: -1.2s; }

.glass-loading-core {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--md-sys-color-primary);
  box-shadow: 0 0 24px color-mix(in srgb, var(--md-sys-color-primary) 35%, transparent);
}

.glass-loading-label {
  color: var(--md-sys-color-on-surface);
  font-size: var(--app-font-size-label);
  font-weight: 500;
}

.glass-reveal-enter-active {
  transition: opacity var(--app-duration-fast) ease;
}

.glass-reveal-leave-active {
  transition: opacity var(--app-duration-normal) ease;
}

.glass-reveal-enter-from,
.glass-reveal-leave-to {
  opacity: 0;
}

.glass-reveal-leave-active .glass-loading-indicator {
  transition: opacity var(--app-duration-normal) ease, transform var(--app-duration-normal) ease;
}

.glass-reveal-leave-to .glass-loading-indicator {
  opacity: 0;
  transform: scale(1.05);
}

@keyframes glass-diffuse {
  from { transform: scale(.45); opacity: .8; }
  to { transform: scale(1.5); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .glass-loading-wave { animation: none; opacity: .35; }
  .wave-delayed { display: none; }
  .glass-reveal-enter-active,
  .glass-reveal-leave-active,
  .glass-reveal-leave-active .glass-loading-indicator { transition: none; }
}
</style>
