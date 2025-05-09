<template>
  <div class="video-player-container">
    <video ref="videoNode" class="video-js vjs-default-skin vjs-big-play-centered"></video>
  </div>
</template>

<script>
import videojs from 'video.js';

export default {
  name: 'VideoPlayer',
  props: {
    videoSrcObj: Object, // Expects { src: 'url', type: 'video/mp4' }
    subtitleUrl: String, // Direct URL for the subtitle
  },
  emits: ['player-ready', 'metadata-loaded', 'player-error', 'player-play', 'subtitle-load-status'],
  data() {
    return {
      player: null,
      currentVttContent: null, // Internal cache for the current video's subtitle VTT
      currentSubtitleNameForStatus: null,
    };
  },
  watch: {
    async videoSrcObj(newSrcObj, oldSrcObj) {
      if (this.player && newSrcObj && newSrcObj.src) {
        if (!oldSrcObj || newSrcObj.src !== oldSrcObj.src || newSrcObj.type !== oldSrcObj.type) {
          console.log('VideoPlayer: New video source received:', newSrcObj.src);
          this.player.reset(); // Reset player, this will also clear old text tracks
          this.currentVttContent = null; // Clear VTT cache for new video
          this.currentSubtitleNameForStatus = null;
          this.player.src({ src: newSrcObj.src, type: newSrcObj.type });
          // Subtitle loading will be triggered by 'loadedmetadata' or if subtitleUrl also changes
        }
      } else if (this.player && !newSrcObj && oldSrcObj) {
        console.log('VideoPlayer: Video source removed, resetting player.');
        this.player.reset();
        this.currentVttContent = null;
        this.currentSubtitleNameForStatus = null;
      }
    },
    async subtitleUrl(newUrl, oldUrl) {
      if (newUrl !== oldUrl) {
        console.log('VideoPlayer: New subtitle URL received:', newUrl);
        this.currentVttContent = null; // Clear previous VTT
        this.currentSubtitleNameForStatus = null;
        await this.loadAndApplySubtitle(newUrl);
      }
    }
  },
  mounted() {
    this.player = videojs(this.$refs.videoNode, { /* ... options same as before ... */
      controls: true, autoplay: false, preload: 'auto', fluid: false, aspectRatio: '16:9',
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3],
      controlBar: { /* ... children same as before ... */
        children: [
            'playToggle', 'volumePanel', 'currentTimeDisplay', 'timeDivider',
            'durationDisplay', 'progressControl', 'liveDisplay', 'remainingTimeDisplay',
            'customControlSpacer', 'chaptersButton', 'descriptionsButton', 'subtitlesButton',
            'captionsButton', 'audioTrackButton', 'pictureInPictureToggle', 'fullscreenToggle',
            'playbackRateMenuButton',
        ]}
    }, () => {
      this.$emit('player-ready');
      console.log('Video.js player instance is ready.');
    });

    this.player.on('loadedmetadata', async () => {
      console.log('VideoPlayer: metadata loaded.');
      const currentSrc = this.player.currentSrc();
      let videoName = '视频';
      if (currentSrc) {
        try {
            const path = new URL(currentSrc).pathname;
            videoName = decodeURIComponent(path.substring(path.lastIndexOf('/') + 1)) || currentSrc;
        } catch { videoName = currentSrc.substring(currentSrc.lastIndexOf('/')+1) || currentSrc; }
      }
      this.$emit('metadata-loaded', videoName);

      // If there's a subtitle URL and VTT content hasn't been loaded/applied yet for this video, load it.
      // Or if VTT was pre-cached (e.g. from subtitleUrl watch), apply it.
      if (this.subtitleUrl && !this.currentVttContent) {
        console.log('VideoPlayer (loadedmetadata): subtitleUrl exists, attempting to load subtitle.');
        await this.loadAndApplySubtitle(this.subtitleUrl);
      } else if (this.currentVttContent) {
        console.log('VideoPlayer (loadedmetadata): Pre-cached VTT exists, applying subtitle.');
        this.addVttToPlayer(this.currentVttContent, this.currentSubtitleNameForStatus || '字幕', this.getExtFromUrl(this.subtitleUrl));
      }
    });

    this.player.on('error', (e) => { /* ... same error handling ... */
        const error = this.player.error();
        let msg = '播放器发生错误';
        if (error) {
            msg += `: ${error.message || '未知错误'} (Code: ${error.code || 'N/A'})`;
        }
        console.error('VideoPlayer Error:', msg, e);
        this.$emit('player-error', msg);
    });
    this.player.on('play', () => this.$emit('player-play'));

    // Initial load if props are set on mount
    if (this.videoSrcObj && this.videoSrcObj.src) {
        this.player.src({ src: this.videoSrcObj.src, type: this.videoSrcObj.type });
        // Subtitle will be attempted on 'loadedmetadata' or if subtitleUrl is also set
    }
    if (this.subtitleUrl && !this.videoSrcObj) { // If only subtitle URL is given initially (less common)
        console.warn("VideoPlayer: Subtitle URL provided on mount, but no video source. Subtitle will load when video source is set.");
    }
  },
  beforeUnmount() {
    if (this.player && !this.player.isDisposed()) {
      this.player.dispose();
      this.player = null;
    }
  },
  methods: {
    async loadAndApplySubtitle(url) {
        if (!url || !this.player || this.player.isDisposed()) {
            if (!url) this.removePreviousCustomSubtitles(); // Clear if URL is removed
            return;
        }
        this.currentSubtitleNameForStatus = this.getFilenameFromUrlInternal(url); // For status messages
        try {
            console.log(`VideoPlayer: Fetching and parsing subtitle from ${url}`);
            const { vttContent, name, ext } = await this.fetchAndParseSubtitleInternal(url);
            this.currentVttContent = vttContent; // Cache VTT for current video
            this.currentSubtitleNameForStatus = name; // Update name from parsed data

            // Only add if player has a current source (video is loaded or loading)
            if (this.player.currentSrc()) {
                 this.addVttToPlayer(vttContent, name, ext);
            } else {
                console.log("VideoPlayer: Subtitle fetched, will be applied on video loadedmetadata.");
            }
            this.$emit('subtitle-load-status', { success: true, message: '加载成功', name });

        } catch (error) {
            console.error('VideoPlayer: Error loading subtitle:', error);
            this.removePreviousCustomSubtitles(); // Clear any partial state
            this.currentVttContent = null;
            this.$emit('subtitle-load-status', { success: false, message: error.message, name: this.currentSubtitleNameForStatus });
        }
    },
    removePreviousCustomSubtitles() {
      if (!this.player || this.player.isDisposed()) return;
      const tracks = this.player.textTracks();
      const tracksToRemove = [];
      for (let i = 0; i < tracks.length; i++) {
        // Remove tracks added by data URL or specifically labeled by us
        if ((tracks[i].src && tracks[i].src.startsWith('data:text/vtt')) || tracks[i].label.includes('(VTT)') || tracks[i].label.includes('(SRT)') || tracks[i].label.includes('(ASS)')) {
          tracksToRemove.push(tracks[i]);
        }
      }
      tracksToRemove.forEach(track => {
        try { this.player.removeRemoteTextTrack(track); }
        catch (e) { console.warn("Error removing text track:", e); }
      });
      console.log("VideoPlayer: Removed previous custom subtitles.");
    },
    addVttToPlayer(vttContent, name, ext) {
      if (!this.player || this.player.isDisposed() || !vttContent) return;
      this.removePreviousCustomSubtitles(); // Ensure only one custom subtitle track is active

      const subtitleDataUrl = `data:text/vtt;charset=utf-8,${encodeURIComponent(vttContent)}`;
      let trackLabel = name ? (name.substring(0, name.lastIndexOf('.')) || name) : '字幕';
      if (ext) trackLabel += ` (${ext.toUpperCase()})`;

      try {
        const newTrack = {
          kind: 'subtitles',
          label: trackLabel,
          language: 'zxx', // Using 'zxx' for "no linguistic content" / "undetermined"
          src: subtitleDataUrl,
          default: true, // Attempt to make it default
        };
        this.player.addRemoteTextTrack(newTrack, false); // `false` means not manually added by user via UI

        // Video.js sometimes needs a nudge to show the track
        this.$nextTick(() => {
            const tracks = this.player.textTracks();
            for (let i = 0; i < tracks.length; i++) {
                if (tracks[i].label === trackLabel) {
                    tracks[i].mode = 'showing';
                    console.log(`VideoPlayer: Set mode to 'showing' for track: ${trackLabel}`);
                    break;
                }
            }
        });
        console.log('VideoPlayer: Subtitle VTT content added to player:', trackLabel);
      } catch (e) {
        console.error('VideoPlayer: Error adding VTT content to player:', e);
        this.$emit('player-error', `添加字幕轨道失败: ${e.message}`);
      }
    },
    getVideoType(url) { /* ... same as before ... */
      if (!url) return '';
      try {
        const path = new URL(url).pathname.toLowerCase();
        if (path.endsWith('.mp4')) return 'video/mp4';
        if (path.endsWith('.webm')) return 'video/webm';
        if (path.endsWith('.ogg') || path.endsWith('.ogv')) return 'video/ogg';
        if (path.endsWith('.m3u8')) return 'application/x-mpegURL';
        if (path.endsWith('.mpd')) return 'application/dash+xml';
        const searchParams = new URL(url).searchParams;
        const typeParam = searchParams.get('type');
        if (typeParam === 'm3u8') return 'application/x-mpegURL';
        if (typeParam === 'mpd') return 'application/dash+xml';
        return '';
      } catch {
        const lowerUrl = url.toLowerCase();
         if (lowerUrl.includes('.mp4')) return 'video/mp4';
         if (lowerUrl.includes('.webm')) return 'video/webm';
         if (lowerUrl.includes('.ogg') || lowerUrl.includes('.ogv')) return 'video/ogg';
         if (lowerUrl.includes('.m3u8')) return 'application/x-mpegURL';
         if (lowerUrl.includes('.mpd')) return 'application/dash+xml';
         return '';
      }
    },
    getFilenameFromUrlInternal(url) { // Helper for internal use
        if (!url) return '未知文件';
        try {
            const path = new URL(url).pathname;
            return decodeURIComponent(path.substring(path.lastIndexOf('/') + 1));
        } catch {
            return url.substring(url.lastIndexOf('/') + 1);
        }
    },
    getExtFromUrl(url) {
        if (!url) return '';
        try {
            const path = new URL(url).pathname;
            const name = path.substring(path.lastIndexOf('/') + 1);
            const dotIndex = name.lastIndexOf('.');
            return dotIndex > 0 ? name.substring(dotIndex + 1).toLowerCase() : '';
        } catch { return ''; }
    },
    async fetchAndParseSubtitleInternal(url) { // Renamed to avoid conflict if exposed via ref
        if (!url) throw new Error('未提供字幕URL');
        const fileExt = this.getExtFromUrl(url);
        const filenameFromUrl = this.getFilenameFromUrlInternal(url);

        if (!['vtt', 'srt', 'ass'].includes(fileExt)) {
            throw new Error('不支持的字幕文件类型 (请检查URL或文件扩展名)');
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} 获取字幕 "${decodeURIComponent(filenameFromUrl)}"`);
        const textContent = await response.text();

        let vttContent = '';
        if (fileExt === 'vtt') vttContent = this.parseVttToVttInternal(textContent);
        else if (fileExt === 'srt') vttContent = this.parseSrtToVttInternal(textContent);
        else if (fileExt === 'ass') vttContent = this.parseAssToVttInternal(textContent);

        if (!vttContent || !vttContent.includes('-->')) {
            throw new Error(`解析字幕 "${decodeURIComponent(filenameFromUrl)}" 失败: 内容为空或格式不正确`);
        }
        return { vttContent, name: decodeURIComponent(filenameFromUrl), ext: fileExt };
    },
    // Internal Parsers (same as before)
    parseVttToVttInternal(vttContent) { /* ... */
        let cleanContent = vttContent.trim();
         if (cleanContent.charCodeAt(0) === 0xFEFF) {
            cleanContent = cleanContent.slice(1);
         }
         if (!cleanContent.startsWith('WEBVTT')) {
              cleanContent = 'WEBVTT\n\n' + cleanContent;
         } else if (!cleanContent.match(/^WEBVTT(\r\n|\n){2}/)) {
            cleanContent = cleanContent.replace(/^WEBVTT(\r\n|\n)/, 'WEBVTT$1$1');
         }
         return cleanContent;
    },
    parseSrtTimeInternal(timeStr) { /* ... */
        const parts = timeStr.split(',');
        const [h, m, s] = parts[0].split(':').map(Number);
        const ms = Number(parts[1] || 0);
        return h * 3600 + m * 60 + s + ms / 1000;
    },
    formatVttTimeInternal(seconds) { /* ... */
        if (isNaN(seconds) || seconds < 0) return '00:00:00.000';
        const totalMilliseconds = Math.round(seconds * 1000);
        const hours = String(Math.floor(totalMilliseconds / 3600000)).padStart(2, '0');
        const minutes = String(Math.floor((totalMilliseconds % 3600000) / 60000)).padStart(2, '0');
        const secs = String(Math.floor((totalMilliseconds % 60000) / 1000)).padStart(2, '0');
        const millis = String(totalMilliseconds % 1000).padStart(3, '0');
        return `${hours}:${minutes}:${secs}.${millis}`;
    },
    parseSrtToVttInternal(srtContent) { /* ... */
        const vttCues = ['WEBVTT\n'];
        const blocks = srtContent.replace(/\r\n|\r/g, '\n').trim().split(/\n\n+/);
        blocks.forEach((block) => {
            const lines = block.split('\n');
            if (!lines || lines.length < 2) return;
            let timeLineIndex = 0;
            if (/^\d+$/.test(lines[0].trim()) && lines.length > 1 && lines[1].includes('-->')) {
                timeLineIndex = 1;
            } else if (!lines[0].includes('-->')) {
                // console.warn('Skipping malformed SRT block (no time):', block);
                return;
            }
            const timeMatch = lines[timeLineIndex].match(/(\d{1,2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{3})/);
            if (timeMatch) {
                const startTime = this.parseSrtTimeInternal(timeMatch[1].replace('.', ','));
                const endTime = this.parseSrtTimeInternal(timeMatch[2].replace('.', ','));
                let text = lines.slice(timeLineIndex + 1).join('\n').trim();
                text = text.replace(/<[^>]*>/g, '');
                if (text && !isNaN(startTime) && !isNaN(endTime) && endTime > startTime) {
                     const vttStartTime = this.formatVttTimeInternal(startTime);
                     const vttEndTime = this.formatVttTimeInternal(endTime);
                     vttCues.push(`${vttStartTime} --> ${vttEndTime}\n${text}\n`);
                 }
            } else {
                // console.warn('Skipping SRT block with malformed timestamp:', lines[timeLineIndex]);
            }
        });
        // if (vttCues.length === 1 && srtContent.length > 0) {
            // console.warn("SRT parsing resulted in no valid cues, but content was present.");
        // }
        return vttCues.join('\n');
    },
    parseAssTimeInternal(timeStr) { /* ... */
         const parts = timeStr.split(':');
         const h = Number(parts[0] || 0);
         const m = Number(parts[1] || 0);
         const sParts = parts[2].split('.');
         const s = Number(sParts[0] || 0);
         const cs = Number(sParts[1] || 0);
         return h * 3600 + m * 60 + s + cs / 100;
    },
    parseAssToVttInternal(assContent) { /* ... */
        const vttCues = ['WEBVTT\n'];
        const lines = assContent.replace(/\r\n|\r/g, '\n').split('\n');
        let inEventsSection = false;
        let dialogueFormat = null;
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.toLowerCase() === '[events]') {
                inEventsSection = true;
                continue;
            }
            if (inEventsSection && trimmedLine.startsWith('[')) {
                inEventsSection = false;
                dialogueFormat = null;
                continue;
            }
            if (!inEventsSection || trimmedLine === '') continue;
            if (trimmedLine.toLowerCase().startsWith('format:')) {
                dialogueFormat = trimmedLine.substring(7).trim().toLowerCase().split(',').map(s => s.trim());
                continue;
            }
            if (trimmedLine.toLowerCase().startsWith('dialogue:') && dialogueFormat) {
                const values = trimmedLine.substring(9).trim().split(',');
                const dialogueData = {};
                dialogueFormat.forEach((key, index) => {
                    if (key === 'text' && index < values.length) {
                        dialogueData[key] = values.slice(index).join(',');
                    } else if (index < values.length) {
                        dialogueData[key] = values[index];
                    }
                });
                const startTimeStr = dialogueData['start'];
                const endTimeStr = dialogueData['end'];
                let text = dialogueData['text'];
                if (startTimeStr && endTimeStr && text) {
                    text = text.replace(/\{[^}]*\}/g, '');
                    text = text.replace(/\\N|\\n/g, '\n');
                    try {
                        const startTime = this.parseAssTimeInternal(startTimeStr);
                        const endTime = this.parseAssTimeInternal(endTimeStr);
                        if (!isNaN(startTime) && !isNaN(endTime) && endTime > startTime) {
                            const vttStartTime = this.formatVttTimeInternal(startTime);
                            const vttEndTime = this.formatVttTimeInternal(endTime);
                            vttCues.push(`${vttStartTime} --> ${vttEndTime}\n${text.trim()}\n`);
                        }
                    } catch (e) {
                        // console.warn('Failed to parse ASS dialogue timing or text:', trimmedLine, e);
                    }
                }
            }
        }
        // if (vttCues.length === 1 && assContent.length > 0) {
        //     console.warn("ASS parsing resulted in no valid cues, but content was present.");
        // }
        return vttCues.join('\n');
    },
  }
};
</script>

<style scoped>
/* Styles for VideoPlayer.vue (same as before) */
.video-player-container {
  flex-grow: 1;
  background-color: #000;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  border: 1px solid var(--panel-border, #4b5867);
  min-height: 200px;
}
.video-player-container .video-js {
    width: 100% !important;
    height: 100% !important;
}

.video-js {
    color: var(--text-color, #e0e0e0);
}
.video-js .vjs-big-play-button {
  background-color: rgba(0, 123, 255, 0.6);
  border-color: rgba(0, 123, 255, 0.8);
  border-radius: 50%;
  width: 3em;
  height: 3em;
  line-height: 3em;
  font-size: 2.5em;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}
.video-js:hover .vjs-big-play-button {
  background-color: rgba(0, 123, 255, 0.8);
  border-color: var(--accent-color, #00b0ff);
}
.video-js .vjs-control-bar {
  background-color: rgba(28, 38, 48, 0.85);
  color: var(--text-color-subtle, #a0b0c0);
  font-size: 0.9rem;
}
.video-js .vjs-button > .vjs-icon-placeholder:before {
  color: var(--text-color-subtle, #a0b0c0);
}
.video-js .vjs-button:hover > .vjs-icon-placeholder:before,
.video-js .vjs-menu-button-popup .vjs-menu-item:hover {
  color: var(--text-color, #e0e0e0);
}
.video-js .vjs-play-progress,
.video-js .vjs-volume-level {
  background-color: var(--accent-color, #00b0ff);
}
.video-js .vjs-slider {
  background-color: rgba(255, 255, 255, 0.25);
}
.video-js .vjs-load-progress {
    background: rgba(255, 255, 255, 0.15);
}
.video-js .vjs-load-progress div {
    background: rgba(255, 255, 255, 0.3);
}
.video-js .vjs-menu-button-popup .vjs-menu {
    background-color: rgba(28, 38, 48, 0.95);
    border: 1px solid var(--panel-border, #4b5867);
}
.video-js .vjs-menu-button-popup .vjs-menu-item {
    color: var(--text-color-subtle, #a0b0c0);
}
.video-js .vjs-menu-button-popup .vjs-menu-item.vjs-selected,
.video-js .vjs-menu-button-popup .vjs-menu-item.vjs-selected:hover {
    background-color: var(--accent-color, #00b0ff);
    color: white;
}

:deep(.video-js .vjs-text-track-display > div > div > div) {
    background-color: rgba(0, 0, 0, 0.7) !important;
    font-family: 'Segoe UI', Roboto, Arial, sans-serif !important;
    font-size: 1.1rem !important;
    color: #fff !important;
    text-shadow: 1px 1px 2px rgba(0,0,0,0.8) !important;
}
</style>