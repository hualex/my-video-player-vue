<template>
  <div :class="['controls-panel-container', { 'is-collapsed-style': isCollapsed }]" ref="controlsPanelRef">
    <button class="collapse-toggle-btn" @click="$emit('toggle-collapse')" title="折叠/展开面板">
      <!-- Icon here (chevron-left) is in main.js library -->
      <font-awesome-icon :icon="['fas', 'chevron-left']" />
    </button>

    <div class="panel-section inputs-section">
      <div class="input-group">
        <label for="videoUrlInputPanel">视频文件URL:</label>
        <input type="text" id="videoUrlInputPanel" v-model="localVideoUrl" placeholder="例如: http://.../video.mp4" />
        <span class="filename-display">{{ videoFilename }}</span>
      </div>
      <div class="input-group">
        <label for="subtitleUrlInputPanel">字幕文件URL:</label>
        <input type="text" id="subtitleUrlInputPanel" v-model="localSubtitleUrl" placeholder="例如: http://.../subs.srt" />
        <span class="filename-display">{{ subtitleFilename }}</span>
      </div>
      <button class="action-button load-media-btn" @click="emitLoadMedia" :disabled="isLoadingList">
        <!-- Icon here (play-circle) is in main.js library -->
        <font-awesome-icon :icon="['fas', 'play-circle']" /> 加载媒体
      </button>
    </div>

    <div class="panel-section file-browser-section">
      <div class="input-group">
        <label for="serverUrlInputPanel">服务器文件列表URL:</label>
        <div class="server-url-wrapper">
          <input type="text" id="serverUrlInputPanel" v-model="localServerUrl" placeholder="例如: http://localhost/files/" @keyup.enter="fetchFiles" />
          <button class="action-button fetch-list-btn" @click="fetchFiles" :disabled="isLoadingList">
            <!-- Icon here (folder-open) is in main.js library -->
            <font-awesome-icon :icon="['fas', 'folder-open']" /> 获取
          </button>
        </div>
      </div>
      <div class="file-list-wrapper" ref="fileListContainerRef" @contextmenu.prevent="handleFileListContextMenu">
        <div v-if="isLoadingList" class="list-placeholder">
            <!-- Icon here (spinner) is in main.js library -->
            <font-awesome-icon icon="spinner" spin class="fa-lg" /> 加载列表中...
        </div>
        <div v-else-if="fetchError" class="list-placeholder error-text">
            {{ fetchError }}
        </div>
        <div v-else-if="!fileItems.length && initialListMessage" class="list-placeholder">{{ initialListMessage }}</div>
        <div v-else-if="!fileItems.length && !initialListMessage" class="list-placeholder">(无文件或无法解析)</div>

        <div
          v-for="item in fileItems"
          :key="item.url + item.name + item.is_directory"
          :class="['file-item', { directory: item.is_directory, video: item.isVideo, subtitle: item.isSubtitle }]"
          :title="item.name"
          @click="handleFileItemClick(item)"
          :data-url="item.url"
          :data-name="item.name"
          :data-is-directory="String(item.is_directory)"
        >
          <!-- Icons from getFileIcon are now based on main.js library -->
          <font-awesome-icon :icon="getFileIcon(item)" class="file-icon" />
          <span>{{ item.name }}</span>
        </div>
      </div>
    </div>

    <div
        v-if="contextMenu.visible"
        class="custom-context-menu-vue"
        :style="{ top: contextMenu.top + 'px', left: contextMenu.left + 'px' }"
        @click.stop
        ref="contextMenuRef"
    >
        <ul>
            <li v-if="contextMenu.itemType === 'file'" @click="contextAction('download')">
                <!-- Icon here (download) is in main.js library -->
                <font-awesome-icon :icon="['fas', 'download']" /> 下载
            </li>
            <li v-if="contextMenu.itemType === 'file'" class="separator"></li>
            <li v-if="contextMenu.itemType === 'file'" @click="contextAction('fillVideo')">
                <!-- Icon here (video) is in main.js library -->
                <font-awesome-icon :icon="['fas', 'video']" /> 填充视频URL
            </li>
            <li v-if="contextMenu.itemType === 'file'" @click="contextAction('fillSubtitle')">
                <!-- Icon here (closed-captioning) is in main.js library -->
                <font-awesome-icon :icon="['fas', 'closed-captioning']" /> 填充字幕URL
            </li>
            <li v-if="contextMenu.itemType === 'directory' || contextMenu.itemType === 'file'" @click="contextAction('copyUrl')">
                <!-- Icon here (copy) is in main.js library -->
                <font-awesome-icon :icon="['fas', 'copy']" /> 复制URL
            </li>
        </ul>
    </div>
  </div>
</template>

<script>
// Spinner icon is added globally in main.js, so local import can be removed if desired
// import { faSpinner } from '@fortawesome/free-solid-svg-icons';
// import { library } from '@fortawesome/fontawesome-svg-core';
// library.add(faSpinner);

export default {
  name: 'ControlsPanel',
  props: {
    isCollapsed: Boolean,
    videoUrlProp: String,
    subtitleUrlProp: String,
    serverUrlProp: String,
  },
  emits: ['toggle-collapse', 'load-media', 'fetch-file-list', 'update:videoUrlProp', 'update:subtitleUrlProp', 'update:serverUrlProp', 'status'],
  data() {
    return {
      localVideoUrl: this.videoUrlProp || '',
      localSubtitleUrl: this.subtitleUrlProp || '',
      localServerUrl: this.serverUrlProp || '',
      fileItems: [],
      isLoadingList: false,
      initialListMessage: '输入服务器URL并点击"获取"',
      fetchError: null,
      contextMenu: {
        visible: false,
        top: 0,
        left: 0,
        targetUrl: '',
        targetName: '',
        itemType: '',
      },
    };
  },
  computed: {
    videoFilename() { return this.getFilenameDisplay(this.localVideoUrl, '视频'); },
    subtitleFilename() { return this.getFilenameDisplay(this.localSubtitleUrl, '字幕'); },
  },
  watch: {
    videoUrlProp(newVal) { this.localVideoUrl = newVal; },
    subtitleUrlProp(newVal) { this.localSubtitleUrl = newVal; },
    serverUrlProp(newVal) {
        if (newVal !== this.localServerUrl) {
            this.localServerUrl = newVal;
        }
    },
    localVideoUrl(newVal) { this.$emit('update:videoUrlProp', newVal); },
    localSubtitleUrl(newVal) { this.$emit('update:subtitleUrlProp', newVal); },
    localServerUrl(newVal) { this.$emit('update:serverUrlProp', newVal); },
  },
  methods: {
    getFilenameDisplay(url, type = '文件') {
      if (!url || url.trim() === '') return `未加载${type}`;
      try {
        const path = new URL(url).pathname;
        const decodedName = decodeURIComponent(path.substring(path.lastIndexOf('/') + 1));
        return decodedName || `加载${type}中...`;
      } catch {
        const lastSlash = url.lastIndexOf('/');
        const name = url.substring(lastSlash + 1);
        return name || `无效URL`;
      }
    },
    emitLoadMedia() {
      this.$emit('load-media', {
        videoUrl: this.localVideoUrl.trim(),
        subtitleUrl: this.localSubtitleUrl.trim(),
      });
    },
    async fetchFiles() {
      const urlToFetch = this.localServerUrl.trim();
      if (!urlToFetch) {
        this.$emit('status', '请输入服务器URL', 'warning', 3000);
        return;
      }
      this.isLoadingList = true;
      this.fileItems = [];
      this.initialListMessage = '';
      this.fetchError = null;
      this.$emit('status', `正在获取: ${urlToFetch}`, 'info');

      try {
        let currentFetchUrl = urlToFetch;
        // ESLint Fix: Removed unnecessary escape for ?
        if (!currentFetchUrl.endsWith('/') && !currentFetchUrl.match(/\.[a-zA-Z0-9]{2,5}(?:[?#]|$)/)) {
            currentFetchUrl += '/';
        }

        const response = await fetch(currentFetchUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} (URL: ${response.url})`);
        }
        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const links = Array.from(doc.querySelectorAll('a'));
        const baseHref = response.url;

        const parsedItems = links.map(link => {
          const href = link.getAttribute('href');
          let name = link.textContent.trim();

          if (!href || href === './' || href.startsWith('?') || name === '' || name === '.' ) {
            return null;
          }
          if (name.toLowerCase() === 'parent directory' || href === '../') {
            try {
                const parentUrl = new URL('../', baseHref).href;
                if (parentUrl !== baseHref && new URL(parentUrl).origin === new URL(baseHref).origin) {
                    if (new URL(baseHref).pathname !== '/') {
                         return { name: '../ (上一级)', url: parentUrl, is_directory: true, isVideo: false, isSubtitle: false };
                    }
                }
            } catch (e) { console.warn("Error resolving parent URL for '../'", e); }
            return null;
          }

           if (name === '') {
               try { name = decodeURIComponent(href.split('/').filter(Boolean).pop() || href); }
               catch { name = href; }
           }
           if (name === '') return null;

          try {
            const fullUrl = new URL(href, baseHref).href;
            const is_directory = href.endsWith('/') || name.endsWith('/');
            const lowerPath = new URL(fullUrl).pathname.toLowerCase();
            const isVideo = /\.(mp4|webm|ogg|m3u8|mpd)$/i.test(lowerPath);
            const isSubtitle = /\.(vtt|srt|ass)$/i.test(lowerPath);

            return { name, url: fullUrl, is_directory, isVideo, isSubtitle };
          } catch (e) {
            console.warn(`Skipping invalid link: ${href} (Base: ${baseHref})`, e);
            return null;
          }
        }).filter(item => item !== null && item.name.toLowerCase() !== 'favicon.ico' && item.name.toLowerCase() !== 'index.html');

        parsedItems.sort((a, b) => {
            if (a.name === '../ (上一级)') return -1;
            if (b.name === '../ (上一级)') return 1;
            if (a.is_directory && !b.is_directory) return -1;
            if (!a.is_directory && b.is_directory) return 1;
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });

        this.fileItems = parsedItems;
        if (!this.fileItems.length) this.initialListMessage = '(目录为空或无法解析)';
        this.$emit('status', `列表加载成功: ${this.fileItems.length} 项`, 'info', 3000);

      } catch (error) {
        console.error('获取文件列表失败:', error);
        this.fetchError = `获取列表失败: ${error.message}`;
        this.$emit('status', this.fetchError, 'error');
        this.initialListMessage = '';
      } finally {
        this.isLoadingList = false;
      }
    },
    handleFileItemClick(item) {
      this.hideContextMenu();
      if (item.is_directory) {
        this.localServerUrl = item.url;
        this.$emit('update:serverUrlProp', item.url);
        this.fetchFiles();
      } else {
        const lowerPath = item.url.toLowerCase();
        if (item.isVideo || /\.(mp4|webm|ogg|m3u8|mpd)$/i.test(lowerPath)) {
          this.localVideoUrl = item.url;
          this.$emit('status', `视频URL填充: ${item.name}`, 'info', 3000);
        } else if (item.isSubtitle || /\.(vtt|srt|ass)$/i.test(lowerPath)) {
          this.localSubtitleUrl = item.url;
          this.$emit('status', `字幕URL填充: ${item.name}`, 'info', 3000);
        } else {
          this.$emit('status', `未知文件类型: ${item.name}`, 'warning', 3000);
        }
      }
    },
    getFileIcon(item) {
      if (item.name === '../ (上一级)') return ['fas', 'arrow-up'];
      if (item.is_directory) return ['fas', 'folder-open'];
      // Using faVideo as primary, faFileVideo is also available in main.js if you prefer that style
      if (item.isVideo) return ['fas', 'video']; // Changed from 'file-video' to 'video'
      if (item.isSubtitle) return ['fas', 'file-lines'];
      return ['fas', 'file'];
    },
    handleFileListContextMenu(event) {
        const itemElement = event.target.closest('.file-item');
        if (!itemElement) {
            this.hideContextMenu();
            return;
        }
        event.preventDefault();
        this.contextMenu.targetUrl = itemElement.dataset.url;
        this.contextMenu.targetName = itemElement.dataset.name;
        this.contextMenu.itemType = itemElement.dataset.isDirectory === 'true' ? 'directory' : 'file';
        let x = event.clientX;
        let y = event.clientY;
        this.contextMenu.visible = true;
        this.$nextTick(() => {
            const menuEl = this.$refs.contextMenuRef;
            if (menuEl) {
                const menuWidth = menuEl.offsetWidth;
                const menuHeight = menuEl.offsetHeight;
                if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 5;
                if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 5;
            }
            this.contextMenu.top = Math.max(0, y);
            this.contextMenu.left = Math.max(0, x);
        });
    },
    hideContextMenu() {
        this.contextMenu.visible = false;
    },
    contextAction(action) {
        const url = this.contextMenu.targetUrl;
        const name = this.contextMenu.targetName;
        this.hideContextMenu();
        if (!url) return;
        switch (action) {
            case 'download': {
                const link = document.createElement('a');
                link.href = url;
                link.download = name || 'download';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                this.$emit('status', `开始下载: ${name}`, 'info', 3000);
                break;
            }
            case 'fillVideo':
                this.localVideoUrl = url;
                this.$emit('status', `视频URL填充: ${name}`, 'info', 3000);
                break;
            case 'fillSubtitle':
                this.localSubtitleUrl = url;
                this.$emit('status', `字幕URL填充: ${name}`, 'info', 3000);
                break;
            case 'copyUrl':
                navigator.clipboard.writeText(url).then(() => {
                    this.$emit('status', 'URL已复制到剪贴板', 'info', 2000);
                }).catch(err => {
                    this.$emit('status', '复制URL失败', 'error', 2000);
                    console.error('Copy URL failed:', err);
                });
                break;
        }
    },
    handleClickOutsideContextMenu(event) {
        if (this.contextMenu.visible) {
            const menuEl = this.$refs.contextMenuRef;
            const clickedFileItem = event.target.closest('.file-item');
            if (menuEl && !menuEl.contains(event.target) && !(event.button === 2 && clickedFileItem) ) {
                this.hideContextMenu();
            }
        }
    }
  },
  mounted() {
    document.addEventListener('click', this.handleClickOutsideContextMenu);
    if (this.localServerUrl && this.localServerUrl.trim() !== '') {
        // this.fetchFiles(); // Auto-fetch on mount can be enabled if desired
    }
  },
  beforeUnmount() {
    document.removeEventListener('click', this.handleClickOutsideContextMenu);
  },
};
</script>

<style scoped>
/* Styles for ControlsPanel.vue */
:root {
    --panel-bg: rgba(40, 50, 60, 0.9);
    --panel-border: #555;
    --text-color: #e0e0e0;
    --text-color-subtle: #bbb;
    --accent-color: #00b0ff;
    --accent-color-dark: #007bff;
    --top-status-height: 0px;
    --input-bg: rgba(255,255,255,0.06);
    --input-border: #555c66;
    --status-error-color: #dc3545; /* Added for error text placeholder */
}

.controls-panel-container {
  background-color: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 320px;
  flex-shrink: 0;
  position: relative;
  box-shadow: 0 4px 15px rgba(0,0,0,0.25);
  overflow-y: auto;
  max-height: calc(100vh - (2 * var(--body-padding-v, 20px)) - var(--top-status-height, 0px) - 2px);
}

.collapse-toggle-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: transparent;
  border: none;
  color: var(--text-color-subtle);
  font-size: 1.1em;
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  transition: color 0.2s, background-color 0.2s, transform 0.2s;
  z-index: 10;
  line-height: 1;
}
.collapse-toggle-btn:hover {
  color: var(--text-color);
  background-color: rgba(255,255,255,0.1);
  transform: scale(1.1);
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.inputs-section {
    padding-bottom: 15px;
}
.file-browser-section {
    border-top: 1px solid var(--input-border);
    padding-top: 15px;
    margin-top: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    min-height: 200px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.input-group label {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-color-subtle);
}
.input-group input[type="text"] {
  padding: 9px 12px;
  background-color: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 5px;
  color: var(--text-color);
  font-size: 0.9rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.input-group input[type="text"]::placeholder {
    color: #778899;
}
.input-group input[type="text"]:focus {
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px rgba(0, 176, 255, 0.25);
    outline: none;
    background-color: rgba(255,255,255,0.08);
}
.filename-display {
    font-size: 0.7rem;
    color: #8899aa;
    font-style: italic;
    margin-top: 1px;
    padding-left: 2px;
    height: 1.1em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.action-button {
  padding: 10px 15px;
  background-image: linear-gradient(to right, var(--accent-color-dark), var(--accent-color));
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.95rem;
  transition: filter 0.2s, transform 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-shadow: 1px 1px 1px rgba(0,0,0,0.2);
}
.action-button:hover {
  filter: brightness(1.1);
}
.action-button:active {
  transform: translateY(1px);
  filter: brightness(0.95);
}
.action-button:disabled {
    background-image: none;
    background-color: #555c66;
    color: #8899aa;
    cursor: not-allowed;
    filter: none;
    text-shadow: none;
}

.server-url-wrapper {
    display: flex;
    gap: 8px;
    align-items: center;
}
.server-url-wrapper input[type="text"] {
    flex-grow: 1;
}
.fetch-list-btn {
    padding: 9px 12px;
    font-size: 0.9rem;
    flex-shrink: 0;
    background-image: none;
    background-color: #4a5568;
}
.fetch-list-btn:hover:not(:disabled) {
    background-color: #5a6578;
    filter: brightness(1.1);
}


.file-list-wrapper {
  background-color: rgba(0,0,0,0.15);
  border: 1px solid var(--input-border);
  border-radius: 5px;
  padding: 8px;
  min-height: 150px;
  max-height: 300px;
  overflow-y: auto;
  flex-grow: 1;
  scrollbar-width: thin;
  scrollbar-color: var(--accent-color) #2d3748;
}
.file-list-wrapper::-webkit-scrollbar { width: 8px; }
.file-list-wrapper::-webkit-scrollbar-track { background: #2d3748; border-radius: 4px; }
.file-list-wrapper::-webkit-scrollbar-thumb { background-color: var(--accent-color); border-radius: 4px; border: 2px solid #2d3748; }

.list-placeholder {
    color: #778899;
    text-align: center;
    padding: 25px 10px;
    font-style: italic;
    font-size: 0.9rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex-grow: 1;
}
.list-placeholder.error-text {
    color: var(--status-error-color, #dc3545);
    font-style: normal;
    font-weight: 500;
}

.file-item {
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-color-subtle);
  transition: background-color 0.15s, color 0.15s, transform 0.1s;
  font-size: 0.85rem;
}
.file-item span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-grow: 1;
}
.file-item:hover {
  background-color: rgba(0, 176, 255, 0.15);
  color: var(--text-color);
}
.file-item.directory {
  color: var(--accent-color);
  font-weight: 500;
}
.file-item.directory:hover {
    color: white;
}
.file-icon {
  font-size: 1em;
  width: 1.3em;
  text-align: center;
  flex-shrink: 0;
  margin-right: 2px;
}
/* Icons for file types are now correctly mapped via getFileIcon using registered names */
.file-item.video .file-icon { color: #ff8f00; } /* Example color override if needed */
.file-item.subtitle .file-icon { color: #64b5f6; } /* Example color override if needed */


.custom-context-menu-vue {
  position: fixed;
  background-color: #2a3a4a;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.3);
  padding: 6px 0;
  z-index: 10000;
  min-width: 200px;
  color: var(--text-color);
  font-size: 0.85rem;
}
.custom-context-menu-vue ul { list-style: none; padding: 0; margin: 0; }
.custom-context-menu-vue li {
  padding: 9px 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: background-color 0.15s, color 0.15s;
}
.custom-context-menu-vue li .fa-icon { /* Corrected selector for FontAwesomeIcon component if used directly, or just rely on icon class */
    font-size: 1em;
    color: var(--text-color-subtle);
    width: 1.1em;
    text-align: center;
    transition: color 0.15s;
}
.custom-context-menu-vue li:hover {
  background-color: var(--accent-color);
  color: white;
}
.custom-context-menu-vue li:hover .fa-icon, /* Corrected selector for FontAwesomeIcon component if used directly */
.custom-context-menu-vue li:hover > svg { /* If FontAwesomeIcon renders as SVG */
    color: white;
}
.custom-context-menu-vue li.separator {
    height: 1px;
    background-color: var(--panel-border);
    margin: 5px 0;
    padding: 0;
    cursor: default;
}
.custom-context-menu-vue li.separator:hover {
    background-color: var(--panel-border);
    color: var(--text-color);
}

@media (max-width: 1024px) {
    .controls-panel-container {
        width: 100%;
        order: 3;
        margin-top: var(--main-gap, 20px);
        max-height: 50vh;
    }
}
@media (max-width: 768px) {
    .controls-panel-container {
        gap: 15px;
        padding: 12px;
    }
    .file-browser-section {
        padding-top: 12px;
    }
    .input-group input[type="text"], .action-button, .fetch-list-btn {
        font-size: 0.85rem;
        padding: 8px 10px;
    }
    .file-list-wrapper { max-height: 200px; }
    .file-item { font-size: 0.8rem; padding: 5px 8px; }
    .custom-context-menu-vue { font-size: 0.8rem; min-width: 180px; }
    .custom-context-menu-vue li { padding: 8px 15px; }
}
</style>