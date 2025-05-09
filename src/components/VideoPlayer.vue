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
    videoSrc: Object,
    subtitleInfo: Object,
  },
  data() {
    return {
      player: null,
    };
  },
  watch: {
    videoSrc(newSrcObj, oldSrcObj) {
      if (this.player && newSrcObj && newSrcObj.src) {
        if (!oldSrcObj || newSrcObj.src !== oldSrcObj.src || newSrcObj.type !== oldSrcObj.type) {
          console.log('VideoPlayer: Resetting and loading new video source:', newSrcObj.src);
          this.player.reset();
          this.player.src({ src: newSrcObj.src, type: newSrcObj.type });
        }
      } else if (this.player && !newSrcObj && oldSrcObj) {
        console.log('VideoPlayer: Video source removed, resetting player.');
        this.player.reset();
      }
    },
    subtitleInfo(newSubInfo) {
      if (this.player && this.player.currentSrc()) {
        if (newSubInfo && newSubInfo.vttContent) {
          console.log('VideoPlayer: Adding subtitle from new subtitleInfo prop:', newSubInfo.name);
          this.addSubtitleToPlayer(newSubInfo.vttContent, newSubInfo.name, newSubInfo.ext);
        } else {
          console.log('VideoPlayer: subtitleInfo is null or empty, removing previous custom subtitles.');
          this.removePreviousCustomSubtitles();
        }
      } else if (this.player && !this.player.currentSrc() && newSubInfo) {
        console.warn("VideoPlayer: Attempted to add subtitle, but no video source is loaded yet.");
      }
    }
  },
  mounted() {
    this.player = videojs(this.$refs.videoNode, {
      controls: true,
      autoplay: false,
      preload: 'auto',
      fluid: false,
      aspectRatio: '16:9',
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3],
      controlBar: {
        children: [
            'playToggle', 'volumePanel', 'currentTimeDisplay', 'timeDivider',
            'durationDisplay', 'progressControl', 'liveDisplay', 'remainingTimeDisplay',
            'customControlSpacer', 'chaptersButton', 'descriptionsButton', 'subtitlesButton',
            'captionsButton', 'audioTrackButton', 'pictureInPictureToggle', 'fullscreenToggle',
            'playbackRateMenuButton',
        ]
      }
    }, () => {
      this.$emit('player-ready');
      console.log('Video.js player instance is ready (from component).');
    });

    this.player.on('loadedmetadata', () => {
      console.log('VideoPlayer: metadata loaded event.');
      this.$emit('metadata-loaded');
    });
    this.player.on('error', () => {
      const error = this.player.error();
      let msg = '播放器发生错误';
      if (error) {
        msg += `: ${error.message || '未知错误'} (Code: ${error.code || 'N/A'})`;
      }
      console.error('VideoPlayer Error:', msg);
      this.$emit('player-error', msg);
    });
    this.player.on('play', () => {
      this.$emit('player-play');
    });

    if (this.videoSrc && this.videoSrc.src) {
        this.player.src({ src: this.videoSrc.src, type: this.videoSrc.type });
    }
  },
  beforeUnmount() {
    if (this.player && !this.player.isDisposed()) {
      this.player.dispose();
      this.player = null;
      console.log('Video.js player disposed.');
    }
  },
  methods: {
    removePreviousCustomSubtitles() {
      if (!this.player || this.player.isDisposed()) return;
      const tracks = this.player.textTracks();
      const tracksToRemove = [];
      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].src && tracks[i].src.startsWith('data:text/vtt')) {
          tracksToRemove.push(tracks[i]);
        }
      }
      tracksToRemove.forEach(track => {
        try {
            this.player.removeRemoteTextTrack(track);
        } catch (e) {
            console.warn("Error removing text track:", e, track);
        }
      });
    },
    addSubtitleToPlayer(vttContent, name, ext) {
      if (!this.player || this.player.isDisposed() || !vttContent) return;
      this.removePreviousCustomSubtitles();

      const subtitleDataUrl = `data:text/vtt;charset=utf-8,${encodeURIComponent(vttContent)}`;
      let trackLabel = name ? (name.substring(0, name.lastIndexOf('.')) || name) : '字幕';
      if (ext) trackLabel += ` (${ext.toUpperCase()})`;

      try {
        this.player.addRemoteTextTrack({
          kind: 'subtitles',
          label: trackLabel,
          language: 'zxx',
          src: subtitleDataUrl,
          default: true
        }, false);

        this.$nextTick(() => {
            const tracks = this.player.textTracks();
            for (let i = 0; i < tracks.length; i++) {
                if (tracks[i].label === trackLabel) {
                    tracks[i].mode = 'showing';
                    break;
                }
            }
        });
        console.log('Subtitle added to player:', trackLabel);
      } catch (e) {
        console.error('Error adding subtitle to player:', e);
        this.$emit('player-error', `添加字幕轨道失败: ${e.message}`);
      }
    },
    getVideoType(url) {
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
    async fetchAndParseSubtitle(url) {
        if (!url) throw new Error('未提供字幕URL');
        let fileExt = '';
        const urlLower = url.toLowerCase();
        // MODIFIED LINE FOR ESLINT: Removed unnecessary escapes for ?
        const filenameMatch = url.match(/[^/\\&?]+\.\w{3,4}(?=([?&].*$|$))/);
        const filenameFromUrl = filenameMatch ? filenameMatch[0] : (url.substring(url.lastIndexOf('/') + 1) || 'subtitle');

        if (urlLower.includes('.vtt')) fileExt = 'vtt';
        else if (urlLower.includes('.srt')) fileExt = 'srt';
        else if (urlLower.includes('.ass')) fileExt = 'ass';
        else throw new Error('不支持的字幕文件类型 (请检查URL或文件扩展名)');

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP错误 ${response.status} 获取字幕 "${decodeURIComponent(filenameFromUrl)}"`);
        const textContent = await response.text();

        let vttContent = '';
        if (fileExt === 'vtt') vttContent = this.parseVttToVttInternal(textContent);
        else if (fileExt === 'srt') vttContent = this.parseSrtToVttInternal(textContent);
        else if (fileExt === 'ass') vttContent = this.parseAssToVttInternal(textContent);

        if (!vttContent || !vttContent.includes('-->')) {
            throw new Error(`解析字幕 "${decodeURIComponent(filenameFromUrl)}" 失败或内容为空/格式不正确`);
        }
        return { vttContent, name: decodeURIComponent(filenameFromUrl), ext: fileExt };
    },
    parseVttToVttInternal(vttContent) {
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
    parseSrtTimeInternal(timeStr) {
        const parts = timeStr.split(',');
        const [h, m, s] = parts[0].split(':').map(Number);
        const ms = Number(parts[1] || 0);
        return h * 3600 + m * 60 + s + ms / 1000;
    },
    formatVttTimeInternal(seconds) {
        if (isNaN(seconds) || seconds < 0) return '00:00:00.000';
        const totalMilliseconds = Math.round(seconds * 1000);
        const hours = String(Math.floor(totalMilliseconds / 3600000)).padStart(2, '0');
        const minutes = String(Math.floor((totalMilliseconds % 3600000) / 60000)).padStart(2, '0');
        const secs = String(Math.floor((totalMilliseconds % 60000) / 1000)).padStart(2, '0');
        const millis = String(totalMilliseconds % 1000).padStart(3, '0');
        return `${hours}:${minutes}:${secs}.${millis}`;
    },
    parseSrtToVttInternal(srtContent) {
        const vttCues = ['WEBVTT\n'];
        const blocks = srtContent.replace(/\r\n|\r/g, '\n').trim().split(/\n\n+/);
        blocks.forEach((block) => {
            const lines = block.split('\n');
            if (!lines || lines.length < 2) return;
            let timeLineIndex = 0;
            if (/^\d+$/.test(lines[0].trim()) && lines.length > 1 && lines[1].includes('-->')) {
                timeLineIndex = 1;
            } else if (!lines[0].includes('-->')) {
                console.warn('Skipping malformed SRT block (no time):', block);
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
                console.warn('Skipping SRT block with malformed timestamp:', lines[timeLineIndex]);
            }
        });
        if (vttCues.length === 1 && srtContent.length > 0) {
            console.warn("SRT parsing resulted in no valid cues, but content was present.");
        }
        return vttCues.join('\n');
    },
    parseAssTimeInternal(timeStr) {
         const parts = timeStr.split(':');
         const h = Number(parts[0] || 0);
         const m = Number(parts[1] || 0);
         const sParts = parts[2].split('.');
         const s = Number(sParts[0] || 0);
         const cs = Number(sParts[1] || 0);
         return h * 3600 + m * 60 + s + cs / 100;
     },
    parseAssToVttInternal(assContent) {
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
                        console.warn('Failed to parse ASS dialogue timing or text:', trimmedLine, e);
                    }
                }
            }
        }
        if (vttCues.length === 1 && assContent.length > 0) {
            console.warn("ASS parsing resulted in no valid cues, but content was present.");
        }
        return vttCues.join('\n');
    },
  }
};
</script>

<style scoped>
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

/* MODIFIED FOR :deep() */
:deep(.video-js .vjs-text-track-display > div > div > div) {
    background-color: rgba(0, 0, 0, 0.7) !important;
    font-family: 'Segoe UI', Roboto, Arial, sans-serif !important;
    font-size: 1.1rem !important;
    color: #fff !important;
    text-shadow: 1px 1px 2px rgba(0,0,0,0.8) !important;
}
</style>