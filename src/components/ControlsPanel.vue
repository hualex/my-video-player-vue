<template>
  <div :class="['controls-panel-container', { collapsed: isCollapsed }]">
    <button class="collapse-toggle-btn" @click="$emit('toggle-collapse')" title="折叠/展开面板">
      <font-awesome-icon :icon="['fas', 'chevron-left']" />
    </button>

    <div class="panel-section inputs-section">
      <div class="input-group">
        <label for="videoUrlInput">视频文件URL:</label>
        <!-- 确保此行没有行内HTML注释 -->
        <input type="text" id="videoUrlInput" v-model="localVideoUrl" placeholder="视频URL..." />
        <span class="filename-display">{{ videoFilename }}</span>
      </div>
      <div class="input-group">
        <label for="subtitleUrlInput">字幕文件URL:</label>
        <!-- 确保此行没有行内HTML注释 -->
        <input type="text" id="subtitleUrlInput" v-model="localSubtitleUrl" placeholder="字幕URL (.vtt, .srt, .ass)..." />
        <span class="filename-display">{{ subtitleFilename }}</span>
      </div>
      <button class="action-button load-media-btn" @click="emitLoadMedia">
        <font-awesome-icon :icon="['fas', 'play-circle']" /> 加载媒体
      </button>
    </div>

    <div class="panel-section file-browser-section">
      <div class="input-group">
        <label for="serverUrlInput">服务器文件列表URL:</label>
        <div class="server-url-wrapper">
          <!-- 确保此行没有行内HTML注释 -->
          <input type="text" id="serverUrlInput" v-model="localServerUrl" placeholder="例如 http://localhost/files/" />
          <button class="action-button fetch-list-btn" @click="fetchFiles">
            <font-awesome-icon :icon="['fas', 'folder-open']" /> 获取
          </button>
        </div>
      </div>
      <div class="file-list-wrapper" ref="fileListContainerRef" @contextmenu="handleFileListContextMenu">
        <div v-if="isLoadingList" class="list-placeholder">加载中...</div>
        <div v-else-if="!fileItems.length && !initialListMessage" class="list-placeholder">(无文件)</div>
        <div v-else-if="initialListMessage && !fileItems.length" class="list-placeholder">{{ initialListMessage }}</div>
        <!-- 确保此 v-for 的 div 开始标签内没有行内HTML注释 -->
        <div
          v-for="item in fileItems"
          :key="item.url + item.name"
          :class="['file-item', { directory: item.is_directory, video: item.isVideo, subtitle: item.isSubtitle }]"
          :title="item.name"
          @click="handleFileItemClick(item)"
          :data-url="item.url"
          :data-name="item.name"
          :data-is-directory="item.is_directory"
        >
          <font-awesome-icon :icon="getFileIcon(item)" class="file-icon" />
          <span>{{ item.name }}</span>
        </div>
      </div>
    </div>

    <!-- Custom Context Menu -->
    <!-- 确保此 div 开始标签内没有行内HTML注释 -->
    <div
        v-if="contextMenu.visible"
        class="custom-context-menu-vue"
        :style="{ top: contextMenu.top + 'px', left: contextMenu.left + 'px' }"
        @click.stop
    >
        <ul>
            <li v-if="contextMenu.itemType === 'file'" @click="contextAction('download')">
                <font-awesome-icon :icon="['fas', 'download']" /> 下载
            </li>
            <li v-if="contextMenu.itemType === 'file'" class="separator"></li>
            <li v-if="contextMenu.itemType === 'file'" @click="contextAction('fillVideo')">
                <font-awesome-icon :icon="['fas', 'video']" /> 填充视频URL
            </li>
            <li v-if="contextMenu.itemType === 'file'" @click="contextAction('fillSubtitle')">
                <font-awesome-icon :icon="['fas', 'closed-captioning']" /> 填充字幕URL
            </li>
            <li v-if="contextMenu.itemType === 'directory' || contextMenu.itemType === 'file'" @click="contextAction('copyUrl')">
                <font-awesome-icon :icon="['fas', 'copy']" /> 复制URL
            </li>
        </ul>
    </div>

  </div>
</template>

<script>
// The <script> and <style> parts should be the same as the previous "complete modified file" version.
// I'm omitting them here for brevity, but ensure they are unchanged from that version.
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
      initialListMessage: '输入服务器URL获取列表',
      contextMenu: {
        visible: false,
        top: 0,
        left: 0,
        targetUrl: '',
        targetName: '',
        itemType: '', // 'file' or 'directory'
      },
    };
  },
  computed: {
    videoFilename() { return this.getFilename(this.localVideoUrl); },
    subtitleFilename() { return this.getFilename(this.localSubtitleUrl); },
  },
  watch: {
    videoUrlProp(newVal) { this.localVideoUrl = newVal; },
    subtitleUrlProp(newVal) { this.localSubtitleUrl = newVal; },
    serverUrlProp(newVal) { this.localServerUrl = newVal; },
    localVideoUrl(newVal) { this.$emit('update:videoUrlProp', newVal); },
    localSubtitleUrl(newVal) { this.$emit('update:subtitleUrlProp', newVal); },
    localServerUrl(newVal) { this.$emit('update:serverUrlProp', newVal); },
  },
  methods: {
    getFilename(url) {
      if (!url) return '未加载';
      try {
        const path = new URL(url).pathname;
        return decodeURIComponent(path.substring(path.lastIndexOf('/') + 1)) || url;
      } catch {
        // Fallback for invalid URLs or if URL parsing fails unexpectedly
        const lastSlash = url.lastIndexOf('/');
        return url.substring(lastSlash + 1) || '无效URL';
      }
    },
    emitLoadMedia() {
      this.$emit('load-media', {
        videoUrl: this.localVideoUrl.trim(),
        subtitleUrl: this.localSubtitleUrl.trim(),
      });
    },
    async fetchFiles() {
      if (!this.localServerUrl.trim()) {
        this.$emit('status', '请输入服务器URL', 'warning', 3000);
        return;
      }
      this.isLoadingList = true;
      this.fileItems = [];
      this.initialListMessage = ''; // Clear initial message
      this.$emit('fetch-file-list', this.localServerUrl.trim());

      try {
        let fetchUrl = this.localServerUrl.trim();
        // Basic directory check: if no extension or ends with /, assume directory
        try {
            let urlObj = new URL(fetchUrl);
            const pathname = urlObj.pathname;
            if (!pathname.endsWith('/')) {
                const lastSegment = pathname.substring(pathname.lastIndexOf('/') + 1);
                if (!lastSegment.includes('.') || lastSegment.indexOf('.') === 0 || lastSegment.split('.').pop().length > 5) { // Heuristic for no extension or very long "extension"
                    urlObj.pathname += '/';
                }
            }
            fetchUrl = urlObj.href;
        } catch (e) {
            // If initial URL is not valid, try appending slash if it doesn't look like a file
            if (!fetchUrl.endsWith('/') && !fetchUrl.match(/\.[a-zA-Z0-9]{1,5}($|\?|#)/) ) {
                 fetchUrl += '/';
            }
            console.warn("Initial server URL might be malformed, attempting with heuristic:", fetchUrl, e);
        }


        const response = await fetch(fetchUrl);
        if (!response.ok) {
          throw new Error(`HTTP错误 ${response.status} 获取列表 (URL: ${response.url})`);
        }
        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const links = Array.from(doc.querySelectorAll('a'));
        const baseHref = response.url;

        const parsedItems = links.map(link => {
          const href = link.getAttribute('href');
          let name = link.textContent.trim();

          if (!href || href === './' || href.startsWith('?') || name === '' || name === '.' || name.toLowerCase() === 'parent directory' || (link.closest('pre') && name === '../')) {
            if (href === '../') {
                try {
                    const parentUrl = new URL(href, baseHref).href;
                    if (parentUrl !== baseHref && new URL(parentUrl).origin === new URL(baseHref).origin) { // Check origin to prevent cross-domain parent links
                       // Ensure we are not going "above" the root of the origin if baseHref is already root
                       if (new URL(baseHref).pathname !== '/' || new URL(parentUrl).pathname !== '/') {
                           return { name: '../ (上一级)', url: parentUrl, is_directory: true, isVideo: false, isSubtitle: false };
                       }
                    }
                } catch (e) { console.warn("Error resolving parent URL", e); }
                return null;
            }
            return null;
          }

           if (name === '') {
               try { name = decodeURIComponent(href.split('/').pop().split('?')[0] || href); }
               catch { name = href; }
           }
           if (name === '' || name === '/') { // If name is still empty or just a slash, try to derive from path
                try {
                    const pathSegments = new URL(href, baseHref).pathname.split('/').filter(Boolean);
                    name = pathSegments.pop() || href;
                    if (href.endsWith('/')) name += '/'; // Re-add trailing slash for display if it was a directory
                } catch { /* fallback to original href if URL parsing fails */ }
           }
           if (name === '') return null;


          try {
            const fullUrl = new URL(href, baseHref).href;
            const is_directory = href.endsWith('/') || name.endsWith('/'); // Check name as well for display consistency
            const lowerPath = new URL(fullUrl).pathname.toLowerCase();
            const isVideo = /\.(mp4|webm|ogg|m3u8|mpd)$/i.test(lowerPath);
            const isSubtitle = /\.(vtt|srt|ass)$/i.test(lowerPath);

            return { name, url: fullUrl, is_directory, isVideo, isSubtitle };
          } catch (e) {
            console.warn(`Skipping invalid link: ${href}`, e);
            return null;
          }
        }).filter(item => item !== null && item.name !== 'favicon.ico'); // Also filter out favicon

        parsedItems.sort((a, b) => {
            if (a.name === '../ (上一级)') return -1;
            if (b.name === '../ (上一级)') return 1;
            if (a.is_directory && !b.is_directory) return -1;
            if (!a.is_directory && b.is_directory) return 1;
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });

        this.fileItems = parsedItems;
        if (!this.fileItems.length) this.initialListMessage = '(目录为空或无法解析)';

      } catch (error) {
        console.error('获取文件列表失败:', error);
        this.$emit('status', `获取列表失败: ${error.message}`, 'error');
        this.initialListMessage = `获取列表失败: ${error.message.substring(0,100)}`; // Show truncated error
      } finally {
        this.isLoadingList = false;
      }
    },
    handleFileItemClick(item) {
      this.hideContextMenu();
      if (item.is_directory) {
        this.localServerUrl = item.url;
        this.fetchFiles();
      } else {
        const lowerPath = item.url.toLowerCase(); // Use item.url for actual file type detection
        if (item.isVideo || /\.(mp4|webm|ogg|m3u8|mpd)$/i.test(lowerPath)) {
          this.localVideoUrl = item.url;
          this.$emit('status', `视频URL已填充: ${item.name}`, 'info', 3000);
        } else if (item.isSubtitle || /\.(vtt|srt|ass)$/i.test(lowerPath)) {
          this.localSubtitleUrl = item.url;
          this.$emit('status', `字幕URL已填充: ${item.name}`, 'info', 3000);
        } else {
          this.$emit('status', `未知文件类型: ${item.name}`, 'warning', 3000);
        }
      }
    },
    getFileIcon(item) {
      // Use Font Awesome array format for icons
      if (item.name === '../ (上一级)') return ['fas', 'arrow-up'];
      if (item.is_directory) return ['fas', 'folder-open'];
      if (item.isVideo) return ['fas', 'file-video'];
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
            const menuEl = this.$el.querySelector('.custom-context-menu-vue');
            if (menuEl) {
                const menuWidth = menuEl.offsetWidth;
                const menuHeight = menuEl.offsetHeight;
                if (y + menuHeight > window.innerHeight) {
                    y -= menuHeight;
                }
                if (x + menuWidth > window.innerWidth) {
                    x -= menuWidth;
                }
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
            case 'fillVideo': {
                this.localVideoUrl = url;
                this.$emit('status', `视频URL填充: ${name}`, 'info', 3000);
                break;
            }
            case 'fillSubtitle': {
                this.localSubtitleUrl = url;
                this.$emit('status', `字幕URL填充: ${name}`, 'info', 3000);
                break;
            }
            case 'copyUrl': {
                navigator.clipboard.writeText(url).then(() => {
                    this.$emit('status', 'URL已复制', 'info', 2000);
                }).catch(err => {
                    this.$emit('status', '复制失败', 'error', 2000);
                    console.error('Copy URL failed:', err);
                });
                break;
            }
        }
    },
    hideContextMenuOnClickOutside(event) {
      if (this.contextMenu.visible) {
          const menuElement = this.$el.querySelector('.custom-context-menu-vue');
          const clickedFileItem = event.target.closest('.file-item');
          if (menuElement && !menuElement.contains(event.target) && !(event.button === 2 && clickedFileItem) ) {
              this.hideContextMenu();
          }
      }
    }
  },
  mounted() {
    document.addEventListener('click', this.hideContextMenuOnClickOutside);
    if (this.localServerUrl && this.localServerUrl.trim() !== '') {
        this.fetchFiles();
    }
  },
  beforeUnmount() {
    document.removeEventListener('click', this.hideContextMenuOnClickOutside);
  },
};
</script>

<style scoped>
/* Styles remain the same as the previous full version */
/* ... (omitted for brevity but should be the same) ... */
:root { 
    --panel-bg: rgba(40, 50, 60, 0.9);
    --panel-border: #555;
    --text-color: #e0e0e0;
    --text-color-subtle: #bbb;
    --accent-color: #00b0ff;
    --accent-color-dark: #007bff;
    --top-status-height: 0px; 
}

.controls-panel-container {
  background-color: var(--panel-bg, rgba(40, 50, 60, 0.9));
  border: 1px solid var(--panel-border, #555);
  border-radius: 8px;
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 300px;
  flex-shrink: 0;
  position: relative; 
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  overflow-y: auto;
  max-height: calc(100vh - 40px - var(--top-status-height, 0px)); 
}
.controls-panel-container.collapsed {
  display: none;
}

.collapse-toggle-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  background: none;
  border: none;
  color: var(--text-color-subtle, #aaa);
  font-size: 1.2em;
  cursor: pointer;
  padding: 5px;
  border-radius: 4px;
  transition: color 0.2s, background-color 0.2s;
  z-index: 1;
}
.collapse-toggle-btn:hover {
  color: var(--text-color, #fff);
  background-color: rgba(255,255,255,0.1);
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 10px; 
}

.file-browser-section {
    border-top: 1px solid var(--panel-border, #444);
    padding-top: 15px;
    margin-top: 10px; 
    flex-grow: 1; 
    display: flex;
    flex-direction: column; 
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.input-group label {
  font-size: 0.8em;
  color: var(--text-color-subtle, #bbb);
}
.input-group input[type="text"] {
  padding: 8px 10px;
  background-color: rgba(255,255,255,0.08);
  border: 1px solid var(--panel-border, #555);
  border-radius: 4px;
  color: var(--text-color, #e0e0e0);
  font-size: 0.9em;
}
.input-group input[type="text"]:focus {
    border-color: var(--accent-color, #00b0ff);
    box-shadow: 0 0 0 2px rgba(0, 176, 255, 0.3);
    outline: none;
}
.filename-display {
    font-size: 0.75em;
    color: #999;
    font-style: italic;
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    height: 1.2em; 
}

.action-button {
  padding: 10px 15px;
  background-color: var(--accent-color, #00b0ff);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.action-button:hover {
  background-color: var(--accent-color-dark, #007bff);
}

.server-url-wrapper {
    display: flex;
    gap: 5px;
    align-items: center; 
}
.server-url-wrapper input[type="text"] {
    flex-grow: 1; 
}
.fetch-list-btn {
    padding: 8px 10px;
    font-size: 0.9em;
    flex-shrink: 0; 
}


.file-list-wrapper {
  background-color: rgba(0,0,0,0.1);
  border: 1px solid var(--panel-border, #444);
  border-radius: 4px;
  padding: 8px;
  min-height: 150px;
  max-height: 250px; 
  overflow-y: auto;
  flex-grow: 1; 
  scrollbar-width: thin;
  scrollbar-color: var(--accent-color, #00b0ff) #333;
}
.file-list-wrapper::-webkit-scrollbar { width: 6px; }
.file-list-wrapper::-webkit-scrollbar-track { background: #333; border-radius: 3px; }
.file-list-wrapper::-webkit-scrollbar-thumb { background-color: var(--accent-color, #00b0ff); border-radius: 3px; }

.list-placeholder {
    color: #888;
    text-align: center;
    padding: 20px;
    font-style: italic;
}

.file-item {
  padding: 5px 8px;
  border-radius: 3px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-color-subtle, #bbb);
  transition: background-color 0.15s, color 0.15s;
  overflow: hidden; 
}
.file-item span { 
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-grow: 1; 
}
.file-item:hover {
  background-color: rgba(0, 176, 255, 0.2);
  color: var(--text-color, #fff);
}
.file-item.directory {
  color: var(--accent-color, #00b0ff);
  font-weight: 500;
}
.file-icon {
  font-size: 0.9em;
  width: 1.2em;
  text-align: center;
  flex-shrink: 0;
}
.file-item.video .file-icon { color: #ff8f00; } 
.file-item.subtitle .file-icon { color: #64b5f6; } 


.custom-context-menu-vue {
  position: fixed;
  background-color: #28323e; 
  border: 1px solid #4b5867; 
  border-radius: 6px;
  box-shadow: 0 3px 10px rgba(0,0,0,0.3);
  padding: 5px 0;
  z-index: 1000;
  min-width: 180px; 
  color: var(--text-color, #e0e0e0);
}
.custom-context-menu-vue ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.custom-context-menu-vue li {
  padding: 8px 15px; 
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px; 
  font-size: 0.9em;
  transition: background-color 0.15s;
}
.custom-context-menu-vue li .fa-icon { 
    font-size: 1em; 
    color: var(--text-color-subtle, #aaa);
    transition: color 0.15s;
}
.custom-context-menu-vue li:hover {
  background-color: var(--accent-color, #00b0ff);
  color: white; 
}
.custom-context-menu-vue li:hover .fa-icon {
    color: white; 
}
.custom-context-menu-vue li.separator {
    height: 1px;
    background-color: #4b5867;
    margin: 4px 0;
    padding: 0;
    cursor: default;
}
.custom-context-menu-vue li.separator:hover {
    background-color: #4b5867; 
    color: var(--text-color, #e0e0e0); 
}

@media (max-width: 1024px) {
    .controls-panel-container {
        width: 100%;
        order: 3; 
        margin-top: 15px;
        max-height: 45vh; 
    }
}
</style>