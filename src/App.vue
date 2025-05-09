<template>
  <div id="app-container">
    <StatusMessage :message="statusMessage" :type="statusType" @height-changed="updateTopStatusHeight" />
    <div class="main-content-area">
      <ControlsPanel
        v-if="!isPanelCollapsed"
        :is-collapsed="isPanelCollapsed"
        @toggle-collapse="togglePanelCollapse"
        @load-media="handleLoadMedia"
        @fetch-file-list="handleFetchFileListInternal"
        :video-url-prop="currentVideoUrl"
        :subtitle-url-prop="currentSubtitleUrl"
        :server-url-prop="currentServerUrl"
        @update:videoUrlProp="currentVideoUrl = $event"
        @update:subtitleUrlProp="currentSubtitleUrl = $event"
        @update:serverUrlProp="currentServerUrl = $event"
        @status="showStatus"
      />
      <div
        v-if="isPanelCollapsed"
        class="uncollapse-button-wrapper"
        @click="togglePanelCollapse"
        title="展开输入面板"
      >
        <!-- Icons here (chevron-down, chevron-right) are in main.js library -->
        <font-awesome-icon :icon="['fas', isSmallScreen ? 'chevron-down' : 'chevron-right']" />
      </div>
      <VideoPlayer
        ref="videoPlayerRef"
        :video-src="videoToLoad"
        :subtitle-info="subtitleToLoadForPlayer"
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
      statusMessage: '',
      statusType: 'info',
      isPanelCollapsed: false,
      isSmallScreen: window.innerWidth <= 1024,
      currentVideoUrl: '',
      currentSubtitleUrl: '',
      currentServerUrl: '',

      videoToLoad: null,
      subtitleToLoadForPlayer: null,

      cachedSubtitleDetails: null,
      clearStatusTimeout: null, // Added for managing timeout
    };
  },
  methods: {
    updateTopStatusHeight() {
        this.$nextTick(() => {
            const statusEl = this.$el.querySelector('.status-message-box');
            const height = statusEl ? statusEl.offsetHeight : 0;
            document.documentElement.style.setProperty('--top-status-height', `${height}px`);
        });
    },
    showStatus(message, type = 'info', duration = 0) {
      this.statusMessage = message;
      this.statusType = type;
      this.updateTopStatusHeight();

      if (this.clearStatusTimeout) {
        clearTimeout(this.clearStatusTimeout);
      }
      if (duration > 0) {
        this.clearStatusTimeout = setTimeout(() => {
          if (this.statusMessage === message) {
            this.clearStatus();
          }
        }, duration);
      }
    },
    clearStatus() {
      this.statusMessage = '';
      this.updateTopStatusHeight();
      if (this.clearStatusTimeout) {
        clearTimeout(this.clearStatusTimeout);
        this.clearStatusTimeout = null;
      }
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

      this.currentVideoUrl = videoUrl;
      this.currentSubtitleUrl = subtitleUrl;
      this.cachedSubtitleDetails = null;
      this.subtitleToLoadForPlayer = null;

      if (subtitleUrl) {
        this.showStatus(`正在加载字幕: ${this.getFilenameFromUrl(subtitleUrl)}...`, 'info');
        try {
          const subtitleData = await this.$refs.videoPlayerRef.fetchAndParseSubtitle(subtitleUrl);
          this.cachedSubtitleDetails = subtitleData;
          this.showStatus(`字幕 (${subtitleData.name}) 加载并缓存成功.`, 'info', 5000);
        } catch (error) {
          this.showStatus(`加载字幕失败: ${error.message}`, 'error');
        }
      } else {
        this.showStatus('未提供字幕URL，仅加载视频.', 'info', 3000);
      }

      this.videoToLoad = {
        src: videoUrl,
        type: this.$refs.videoPlayerRef.getVideoType(videoUrl) || undefined,
      };
    },
    handleFetchFileListInternal(serverUrl) {
      console.log('App is aware of fetch-file-list event for:', serverUrl);
      this.currentServerUrl = serverUrl;
    },
    onPlayerReady() {
      this.showStatus('播放器准备就绪，请加载视频。', 'info', 3000);
    },
    onPlayerMetadataLoaded() {
      this.showStatus('视频元数据已加载.', 'info', 2000);
      if (this.cachedSubtitleDetails) {
        this.subtitleToLoadForPlayer = { ...this.cachedSubtitleDetails };
      }
    },
    handlePlayerError(errorMsg) {
      this.showStatus(errorMsg, 'error');
      if (this.isPanelCollapsed) {
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
        const lastSlash = url.lastIndexOf('/');
        return url.substring(lastSlash + 1);
      }
    },
    handleResize() {
      this.isSmallScreen = window.innerWidth <= 1024;
      this.updateTopStatusHeight();
    }
  },
  mounted() {
    window.addEventListener('resize', this.handleResize);
    this.updateTopStatusHeight();
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleResize);
    if (this.clearStatusTimeout) {
      clearTimeout(this.clearStatusTimeout);
    }
  },
};
</script>

<style>
/* Global styles */
:root {
    --bg-gradient-start: #1a2a3a;
    --bg-gradient-end: #2a3a4a;
    --text-color: #e0e0e0;
    --panel-bg: rgba(40, 50, 60, 0.92);
    --panel-border: #4b5867;
    --input-bg: rgba(255, 255, 255, 0.06);
    --input-border: #555c66;
    --accent-color: #00b0ff;
    --accent-color-dark: #007acc;
    --text-color-subtle: #a0b0c0;
    --top-status-height: 0px;
    --body-padding-v: 20px;
    --main-gap: 15px;
}

body {
  margin: 0;
  font-family: 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  background: linear-gradient(135deg, var(--bg-gradient-start) 0%, var(--bg-gradient-end) 100%);
  color: var(--text-color);
  min-height: 100vh;
  line-height: 1.6;
}

#app-container {
  display: flex;
  flex-direction: column;
  padding: var(--body-padding-v);
  box-sizing: border-box;
  min-height: 100vh;
}

.main-content-area {
  display: flex;
  gap: var(--main-gap);
  flex-grow: 1;
  width: 100%;
  max-width: 1700px;
  margin: 0 auto;
  align-items: flex-start;
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
  width: 40px;
  min-height: 120px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.uncollapse-button-wrapper:hover {
    background-color: rgba(50, 60, 70, 0.95);
    color: white;
    transform: scale(1.03);
}

@media (max-width: 1024px) {
  #app-container {
    padding: 15px;
    --body-padding-v: 15px;
  }
  .main-content-area {
    flex-direction: column;
    gap: 20px;
    --main-gap: 20px;
  }
  .uncollapse-button-wrapper {
    width: 100%;
    min-height: auto;
    padding: 10px 15px;
    order: 2;
    margin-top: 0;
  }
}
@media (max-width: 768px) {
  #app-container {
    padding: 10px;
    --body-padding-v: 10px;
  }
}
</style>