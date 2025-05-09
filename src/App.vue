<template>
  <div id="app-container">
    <StatusMessage :message="statusMessage" :type="statusType" />
    <div class="main-content-area">
      <ControlsPanel
        :is-collapsed="isPanelCollapsed"
        @toggle-collapse="togglePanelCollapse"
        @load-media="handleLoadMedia"
        @fetch-file-list="handleFetchFileList"
        :video-url-prop="currentVideoUrl"
        :subtitle-url-prop="currentSubtitleUrl"
        :server-url-prop="currentServerUrl"
        @update:videoUrlProp="currentVideoUrl = $event"
        @update:subtitleUrlProp="currentSubtitleUrl = $event"
        @update:serverUrlProp="currentServerUrl = $event"
      />
      <div
        v-if="isPanelCollapsed"
        class="uncollapse-button-wrapper"
        @click="togglePanelCollapse"
        title="展开输入面板"
      >
        <font-awesome-icon :icon="['fas', isSmallScreen ? 'chevron-down' : 'chevron-right']" />
      </div>
      <VideoPlayer
        ref="videoPlayerRef"
        :video-src="videoToLoad"
        :subtitle-info="subtitleToLoad"
        @player-ready="onPlayerReady"
        @metadata-loaded="onPlayerMetadataLoaded"
        @player-error="handlePlayerError"
        @player-play="handlePlayerPlay"
      />
    </div>
  </div>
</template>

<script>
import StatusMessage from './components/StatusMessage.vue';
import ControlsPanel from './components/ControlsPanel.vue';
import VideoPlayer from './components/VideoPlayer.vue';
// 导入 video.js 的 CSS
import 'video.js/dist/video-js.css';

export default {
  name: 'App',
  components: {
    StatusMessage,
    ControlsPanel,
    VideoPlayer,
  },
  data() {
    return {
      // Status Message
      statusMessage: '',
      statusType: 'info', // 'info', 'warning', 'error'

      // Panel State
      isPanelCollapsed: false,
      isSmallScreen: window.innerWidth <= 1024, // For uncollapse button icon

      // Media URLs managed by App, passed to ControlsPanel
      currentVideoUrl: '',
      currentSubtitleUrl: '',
      currentServerUrl: 'http://localhost:8080/videos/', // Default example

      // Data to send to VideoPlayer component
      videoToLoad: null,      // { src: 'url', type: 'video/mp4' }
      subtitleToLoad: null,   // Cached VTT content for the player

      // Cached subtitle info from parser
      cachedSubtitleVtt: null,
      cachedSubtitleName: null,
      cachedSubtitleExt: null,
    };
  },
  methods: {
    showStatus(message, type = 'info', duration = 0) {
      this.statusMessage = message;
      this.statusType = type;
      if (duration > 0) {
        setTimeout(() => {
          if (this.statusMessage === message) { // Only clear if it's the same message
            this.clearStatus();
          }
        }, duration);
      }
    },
    clearStatus() {
      this.statusMessage = '';
    },
    togglePanelCollapse() {
      this.isPanelCollapsed = !this.isPanelCollapsed;
    },
    async handleLoadMedia({ videoUrl, subtitleUrl }) {
      this.clearStatus();
      if (!videoUrl) {
        this.showStatus('错误: 请输入视频文件URL', 'error');
        return;
      }

      this.currentVideoUrl = videoUrl; // Update local data for ControlsPanel
      this.currentSubtitleUrl = subtitleUrl;

      // 1. Fetch and cache subtitle (if any)
      this.subtitleToLoad = null; // Reset subtitle for player
      this.cachedSubtitleVtt = null;
      this.cachedSubtitleName = null;
      this.cachedSubtitleExt = null;

      if (subtitleUrl) {
        this.showStatus(`正在加载字幕: ${this.getFilenameFromUrl(subtitleUrl)}...`, 'info');
        try {
          const { vttContent, name, ext } = await this.$refs.videoPlayerRef.fetchAndParseSubtitle(subtitleUrl); // Call method on VideoPlayer
          this.cachedSubtitleVtt = vttContent;
          this.cachedSubtitleName = name;
          this.cachedSubtitleExt = ext;
          this.showStatus(`字幕 (${name}) 加载并缓存成功.`, 'info', 5000);
        } catch (error) {
          this.showStatus(`加载字幕失败: ${error.message}`, 'error');
          // Continue to load video even if subtitle fails
        }
      } else {
        this.showStatus('未提供字幕URL，仅加载视频.', 'info', 3000);
      }

      // 2. Prepare video source for VideoPlayer component
      this.videoToLoad = {
        src: videoUrl,
        type: this.$refs.videoPlayerRef.getVideoType(videoUrl) || undefined, // Call method on VideoPlayer
      };
      // The VideoPlayer component will watch `videoSrc` and `subtitleInfo` props
    },
    handleFetchFileList(serverUrl) {
      // This event will be handled by ControlsPanel itself internally
      // App.vue doesn't need to directly manage file list items,
      // but it does manage the serverUrl input via ControlsPanel props.
      console.log('App received fetch-file-list event for:', serverUrl);
      this.currentServerUrl = serverUrl; // Keep serverUrl in sync
    },
    onPlayerReady() {
      this.showStatus('播放器准备就绪，请加载视频。', 'info', 3000);
    },
    onPlayerMetadataLoaded() {
      this.showStatus('视频元数据已加载.', 'info', 2000);
      // Now that metadata is loaded, if we have a cached subtitle, pass it to the player
      if (this.cachedSubtitleVtt) {
         this.subtitleToLoad = {
            vttContent: this.cachedSubtitleVtt,
            name: this.cachedSubtitleName,
            ext: this.cachedSubtitleExt,
         };
      }
    },
    handlePlayerError(errorMsg) {
      this.showStatus(errorMsg, 'error');
      if (this.isPanelCollapsed) { // Show panel on error
        this.togglePanelCollapse();
      }
    },
    handlePlayerPlay() {
      if (this.statusType !== 'error' && this.statusType !== 'warning') {
        this.clearStatus();
      }
    },
    getFilenameFromUrl(url) {
        if (!url) return '';
        try {
            const path = new URL(url).pathname;
            return decodeURIComponent(path.substring(path.lastIndexOf('/') + 1));
        } catch {
            return url.substring(url.lastIndexOf('/') + 1);
        }
    },
    handleResize() {
        this.isSmallScreen = window.innerWidth <= 1024;
    }
  },
  mounted() {
    window.addEventListener('resize', this.handleResize);
    // Set initial server URL for ControlsPanel if desired
    // this.currentServerUrl = 'http://your-default-server.com/files/';
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleResize);
  },
};
</script>

<style>
/* Global styles - can be moved to a separate CSS file and imported */
:root {
    --bg-gradient-start: #1a2a3a;
    --bg-gradient-end: #2a3a4a;
    --text-color: #e0e0e0;
    --panel-bg: rgba(40, 50, 60, 0.9);
    --panel-border: #555;
    --accent-color: #00b0ff;
    /* Add more color vars from your original CSS */
}

body {
  margin: 0;
  font-family: 'Segoe UI', Roboto, Arial, sans-serif;
  background: linear-gradient(135deg, var(--bg-gradient-start) 0%, var(--bg-gradient-end) 100%);
  color: var(--text-color);
  min-height: 100vh;
}

#app-container {
  display: flex;
  flex-direction: column;
  padding: 20px;
  box-sizing: border-box;
  min-height: 100vh; /* Ensure app container takes full height */
}

.main-content-area {
  display: flex;
  gap: 15px;
  flex-grow: 1; /* Allow this area to take remaining space */
  width: 100%;
  max-width: 1600px; /* Limit max width */
  margin: 0 auto; /* Center */
  align-items: flex-start; /* Align panel and video at the top */
}

.uncollapse-button-wrapper {
  background-color: var(--panel-bg);
  border: 1px solid var(--panel-border);
  color: var(--accent-color);
  padding: 15px 8px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4em;
  align-self: flex-start;
  transition: all 0.3s ease;
  /* Vertical on large screen */
  width: 40px;
  min-height: 120px;
}
.uncollapse-button-wrapper:hover {
    background-color: rgba(40, 50, 60, 0.95);
    color: var(--text-color);
    transform: scale(1.05);
}

/* Responsive adjustments for main layout */
@media (max-width: 1024px) {
  .main-content-area {
    flex-direction: column;
  }
  .uncollapse-button-wrapper {
    width: 100%;
    min-height: auto;
    padding: 10px 15px;
    margin-top: 15px; /* Add margin when stacked */
    order: 2; /* Ensure it's below video if panel is below video */
  }
}
</style>