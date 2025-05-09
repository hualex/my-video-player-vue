<template>
  <div id="app-container">
    <StatusMessage :message="statusMessage" :type="statusType" @height-changed="updateTopStatusHeight" />
    <div class="main-content-area">
      <ControlsPanel
        v-if="!isPanelCollapsed"
        @toggle-collapse="togglePanelCollapse"
        @load-media="handleLoadMedia"
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
        <font-awesome-icon :icon="['fas', isSmallScreen ? 'chevron-down' : 'chevron-right']" />
      </div>
      <VideoPlayer
        ref="videoPlayerRef"
        :video-src-obj="videoToLoad"
        :subtitle-data="activeSubtitleData"
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
import SubtitleManager from '@/services/SubtitleManager.js'; // Import the manager
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
      currentSubtitleUrl: '', // This will be used to fetch/cache via SubtitleManager
      currentServerUrl: '',

      videoToLoad: null,
      activeSubtitleData: null, // This will hold { vttContent, name, ext, originalUrl } for VideoPlayer

      clearStatusTimeout: null,
    };
  },
  methods: {
    // ... (showStatus, clearStatus, togglePanelCollapse, updateTopStatusHeight, getFilenameFromUrl, handleResize - same as before)
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
      if (this.clearStatusTimeout) clearTimeout(this.clearStatusTimeout);
      if (duration > 0) {
        this.clearStatusTimeout = setTimeout(() => {
          if (this.statusMessage === message) this.clearStatus();
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
    },

    async handleLoadMedia({ videoUrl, subtitleUrl }) {
      this.clearStatus();
      if (!videoUrl) {
        this.showStatus('错误: 请输入视频文件URL', 'error');
        return;
      }

      this.currentVideoUrl = videoUrl;
      this.currentSubtitleUrl = subtitleUrl; // Store the raw URL
      this.activeSubtitleData = null; // Reset active subtitle for player

      // Prepare video for player
      this.videoToLoad = {
        src: videoUrl,
        type: this.$refs.videoPlayerRef?.getVideoType(videoUrl) || undefined,
      };
      
      if (subtitleUrl) {
        this.showStatus(`正在加载字幕: ${this.getFilenameFromUrl(subtitleUrl)}...`, 'info');
        try {
          // Asynchronously fetch and cache the subtitle.
          // The result will be passed to VideoPlayer once the video is ready (onPlayerMetadataLoaded)
          // or if subtitle loads faster.
          const subtitleData = await SubtitleManager.fetchAndCacheSubtitle(subtitleUrl);
          // If video is already playing or metadata loaded, we might need to update activeSubtitleData here.
          // For simplicity, we'll set it now and let VideoPlayer's watcher handle it.
          this.activeSubtitleData = subtitleData;
          this.showStatus(`字幕 (${subtitleData.name}) 已加载并缓存.`, 'info', 5000);
        } catch (error) {
          this.activeSubtitleData = null; // Ensure it's null on error
          this.showStatus(`加载字幕失败: ${error.message}`, 'error');
        }
      } else {
        this.showStatus('仅加载视频 (无字幕).', 'info', 3000);
      }
    },

    onPlayerReady() {
      this.showStatus('播放器准备就绪。', 'info', 3000);
    },
    onPlayerMetadataLoaded(videoName) {
      this.showStatus(`视频 (${videoName || '未知'}) 元数据已加载.`, 'info', 3000);
      // At this point, video is ready. If subtitle was fetched by handleLoadMedia,
      // its VTT content is in this.activeSubtitleData, which VideoPlayer's prop watcher will pick up.
      // If currentSubtitleUrl exists but activeSubtitleData is still null (e.g., subtitle took longer),
      // we could try to get it from cache again, or rely on the initial fetch in handleLoadMedia.
      if (this.currentSubtitleUrl && !this.activeSubtitleData) {
        const cachedSub = SubtitleManager.getSubtitleFromCache(this.currentSubtitleUrl);
        if (cachedSub) {
            console.log("App: Found subtitle in cache after metadata load, applying.");
            this.activeSubtitleData = cachedSub;
        } else {
            console.warn("App: Subtitle URL present, but not yet in cache after metadata load.");
             // Optionally re-trigger fetch if it failed or was slow, but handleLoadMedia should cover this.
        }
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
    // Optionally clear subtitle cache on app close, or manage it more granularly
    // SubtitleManager.clearCache();
  },
};
</script>

<style>
/* Global styles (same as before) */
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