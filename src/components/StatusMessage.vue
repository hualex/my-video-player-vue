<template>
  <transition name="status-fade">
    <div v-if="message" :class="['status-message-box', type]" ref="statusBoxRef">
      <font-awesome-icon :icon="iconName" class="status-icon" />
      <span>{{ message }}</span>
    </div>
  </transition>
</template>

<script>
export default {
  name: 'StatusMessage',
  props: {
    message: String,
    type: {
      type: String,
      default: 'info',
    },
  },
  computed: {
    iconName() {
      if (this.type === 'error') return ['fas', 'circle-xmark'];
      if (this.type === 'warning') return ['fas', 'exclamation-triangle'];
      return ['fas', 'info-circle'];
    },
  },
  watch: {
    message(newMessage, oldMessage) {
      // Emit an event when the message content (and thus potentially height) changes
      // This allows App.vue to react and update its --top-status-height CSS variable
      if (newMessage !== oldMessage) {
        this.$nextTick(() => {
          this.$emit('height-changed');
        });
      }
    }
  },
  emits: ['height-changed'], // Declare emitted events
};
</script>

<style scoped>
.status-message-box {
  padding: 10px 15px;
  border-radius: 6px; /* Softer radius */
  margin-bottom: var(--main-gap, 15px);
  display: flex;
  align-items: center;
  gap: 10px; /* Increased gap */
  text-align: left;
  border: 1px solid;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
  max-width: 1600px; /* Match main content area */
  margin-left: auto;
  margin-right: auto;
  font-size: 0.9rem;
}
.status-icon {
  font-size: 1.25em; /* Slightly larger icon */
  flex-shrink: 0;
}
.status-message-box.info {
  background-color: rgba(0, 176, 255, 0.12); /* Slightly more visible */
  color: var(--accent-color, #00b0ff);
  border-color: var(--accent-color, #00b0ff);
}
.status-message-box.warning {
  background-color: rgba(255, 193, 7, 0.12); /* Adjusted warning color */
  color: #ffc107;
  border-color: #ffc107;
}
.status-message-box.error {
  background-color: rgba(220, 53, 69, 0.12); /* Adjusted error color */
  color: #dc3545;
  border-color: #dc3545;
}

/* Fade animation */
.status-fade-enter-active,
.status-fade-leave-active {
  transition: opacity 0.3s ease-out, transform 0.3s ease-out;
}
.status-fade-enter-from,
.status-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>