<template>
  <div v-if="message" :class="['status-message-box', type]" ref="statusBox">
    <font-awesome-icon :icon="iconName" class="status-icon" />
    <span>{{ message }}</span>
  </div>
</template>

<script>
export default {
  name: 'StatusMessage',
  props: {
    message: String,
    type: {
      type: String,
      default: 'info', // 'info', 'warning', 'error'
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
    message(newMessage) {
        // When message changes, ensure the parent App.vue's top-status-height is updated
        // This is a bit tricky as this component doesn't know about App's CSS var.
        // A better way might be for App.vue to observe the height of this component's slot/container.
        // For now, we rely on App.vue's logic that calls showStatus which might trigger height update.
        // Alternatively, emit an event if height might have significantly changed.
        if (newMessage) {
            this.$nextTick(() => {
                // You could emit an event here if App.vue needs to react to height changes
                // this.$emit('height-changed', this.$refs.statusBox?.offsetHeight || 0);
            });
        }
    }
  }
};
</script>

<style scoped>
.status-message-box {
  padding: 10px 15px;
  border-radius: 5px;
  margin-bottom: 15px; /* Space below the status message */
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  border: 1px solid;
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
  max-width: 1600px;
  margin-left: auto;
  margin-right: auto;
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.status-icon {
  font-size: 1.2em;
  flex-shrink: 0;
}
.status-message-box.info {
  background-color: rgba(0, 176, 255, 0.1);
  color: #00b0ff;
  border-color: #00b0ff;
}
.status-message-box.warning {
  background-color: rgba(255, 204, 0, 0.1);
  color: #ffcc00;
  border-color: #ffcc00;
}
.status-message-box.error {
  background-color: rgba(255, 0, 0, 0.1);
  color: #ff6666;
  border-color: #ff6666;
}
/* Animation for appearance */
.v-enter-active, .v-leave-active {
    transition: opacity 0.5s ease;
}
.v-enter-from, .v-leave-to {
    opacity: 0;
}
</style>