<template>
  <div class="video-player-container">
    <video ref="videoNode" class="video-js vjs-default-skin"></video>
  </div>
</template>

<script>
import videojs from 'video.js';

export default {
  name: 'VideoPlayer',
  props: {
    videoSrc: Object, // Expects { src: 'url', type: 'video/mp4' }
    subtitleInfo: Object, // Expects { vttContent: '...', name: '...', ext: '...' }
  },
  data() {
    return {
      player: null,
    };
  },
  watch: {
    videoSrc(newSrcObj) {
      if (this.player && newSrcObj && newSrcObj.src) {
        this.player.reset(); // Reset before loading new source
        this.player.src({ src: newSrcObj.src, type: newSrcObj.type });
        // Subtitles will be handled by the subtitleInfo watcher or when metadata loads
      } else if (this.player && !newSrcObj) {
        this.player.reset();
      }
    },
    subtitleInfo(newSubInfo) {
        if (this.player && newSubInfo && newSubInfo.vttContent) {
            this.addSubtitleToPlayer(newSubInfo.vttContent, newSubInfo.name, newSubInfo.ext);
        } else if (this.player && !newSubInfo) {
            this.removePreviousSubtitles(); // Remove subs if newSubInfo is null
        }
    }
  },
  mounted() {
    this.player = videojs(this.$refs.videoNode, {
      controls: true,
      autoplay: false,
      preload: 'auto',
      fluid: false, // Important if container has fixed aspect ratio
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3],
    }, () => {
      this.$emit('player-ready');
      console.log('Video.js player is ready (from component).');
    });

    this.player.on('loadedmetadata', () => {
      this.$emit('metadata-loaded');
    });
    this.player.on('error', () => {
      const error = this.player.error();
      let msg = '播放器发生错误';
      if (error) {
        msg += `: ${error.message || '未知错误'} (Code: ${error.code || 'N/A'})`;
      }
      this.$emit('player-error', msg);
    });
    this.player.on('play', () => {
      this.$emit('player-play');
    });

    // If initial videoSrc is provided
    if (this.videoSrc && this.videoSrc.src) {
        this.player.src({ src: this.videoSrc.src, type: this.videoSrc.type });
    }
    // If initial subtitleInfo is provided
    if (this.subtitleInfo && this.subtitleInfo.vttContent) {
        // Wait for player to be ready for subtitles, ideally after 'loadedmetadata' of video
        // but for now, we'll try adding it if videoSrc is also present
        if(this.player.currentSrc()){ // Add only if a video source is already loaded
             this.addSubtitleToPlayer(this.subtitleInfo.vttContent, this.subtitleInfo.name, this.subtitleInfo.ext);
        }
    }
  },
  beforeUnmount() {
    if (this.player) {
      this.player.dispose();
      this.player = null;
    }
  },
  methods: {
    removePreviousSubtitles() {
      if (!this.player) return;
      const tracks = this.player.textTracks();
      const tracksToRemove = [];
      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].src && tracks[i].src.startsWith('data:text/vtt')) {
          tracksToRemove.push(tracks[i]);
        }
      }
      tracksToRemove.forEach(track => this.player.removeRemoteTextTrack(track));
    },
    addSubtitleToPlayer(vttContent, name, ext) {
      if (!this.player || !vttContent) return;
      this.removePreviousSubtitles();

      const subtitleDataUrl = `data:text/vtt;charset=utf-8,${encodeURIComponent(vttContent)}`;
      let trackLabel = name ? (name.substring(0, name.lastIndexOf('.')) || name) : '字幕';
      if (ext) trackLabel += ` (${ext.toUpperCase()})`;

      try {
        this.player.addRemoteTextTrack({
          kind: 'captions',
          label: trackLabel,
          language: 'und',
          src: subtitleDataUrl,
        }, true); // Add to menu
        console.log('Subtitle added to player:', trackLabel);
      } catch (e) {
        console.error('Error adding subtitle to player:', e);
        this.$emit('player-error', `添加字幕轨道失败: ${e.message}`);
      }
    },
    // Expose helper methods that App.vue might need
    getVideoType(url) {
      if (!url) return '';
      try {
        const path = new URL(url).pathname.toLowerCase();
        if (path.endsWith('.mp4')) return 'video/mp4';
        if (path.endsWith('.webm')) return 'video/webm';
        if (path.endsWith('.ogg') || path.endsWith('.ogv')) return 'video/ogg';
        if (path.endsWith('.m3u8')) return 'application/x-mpegURL';
        if (path.endsWith('.mpd')) return 'application/dash+xml';
        return ''; // Fallback
      } catch {
        const lowerUrl = url.toLowerCase();
         if (lowerUrl.endsWith('.mp4')) return 'video/mp4';
         if (lowerUrl.endsWith('.webm')) return 'video/webm';
         if (lowerUrl.endsWith('.ogg') || lowerUrl.endsWith('.ogv')) return 'video/ogg';
         return '';
      }
    },
    async fetchAndParseSubtitle(url) {
        // This method now belongs to VideoPlayer and is called by App.vue
        // It should return the parsed VTT content or throw an error.
        if (!url) throw new Error('未提供字幕URL');
        let fileExt = '';
        const urlLower = url.toLowerCase();
        if (urlLower.endsWith('.vtt')) fileExt = 'vtt';
        else if (urlLower.endsWith('.srt')) fileExt = 'srt';
        else if (urlLower.endsWith('.ass')) fileExt = 'ass';
        else throw new Error('不支持的字幕文件类型');

        const filename = url.substring(url.lastIndexOf('/') + 1) || url;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP错误 ${response.status} 获取字幕`);
        const textContent = await response.text();

        let vttContent = '';
        if (fileExt === 'vtt') vttContent = this.parseVttToVttInternal(textContent);
        else if (fileExt === 'srt') vttContent = this.parseSrtToVttInternal(textContent);
        else if (fileExt === 'ass') vttContent = this.parseAssToVttInternal(textContent);

        if (!vttContent || !vttContent.includes('-->')) {
            throw new Error('解析字幕失败或内容为空');
        }
        return { vttContent, name: decodeURIComponent(filename.split('?')[0]), ext: fileExt };
    },
    // Internal Parsers (copied from your original JS, ensure they are methods of this component)
    parseVttToVttInternal(vttContent) { /* ... your original parseVttToVtt logic ... */
         let cleanContent = vttContent.trim();
         if (!cleanContent.startsWith('WEBVTT')) {
              cleanContent = 'WEBVTT\n\n' + cleanContent;
         }
         if (cleanContent.charCodeAt(0) === 0xFEFF) {
            cleanContent = cleanContent.slice(1);
         }
         if (cleanContent.startsWith('WEBVTT\n\n') === false && cleanContent.startsWith('WEBVTT\n')) {
             cleanContent = cleanContent.replace('WEBVTT\n', 'WEBVTT\n\n');
         }
         return cleanContent;
    },
    parseSrtToVttInternal(srtContent) { /* ... your original parseSrtToVtt logic ... */
        const vttCues = ['WEBVTT\n'];
        const blocks = srtContent.trim().split(/\r?\n\r?\n/);
        blocks.forEach((block) => {
            const lines = block.split(/\r?\n/);
            if (!lines || lines.length < 2) return;
            let startIndex = 0;
            if (/^\d+$/.test(lines[0].trim())) startIndex = 1;
            if (lines.length <= startIndex) return;
            const timeMatch = lines[startIndex].match(/(\d{1,2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2},\d{3})/);
            if (timeMatch) {
                const startTime = this.parseSrtTimeInternal(timeMatch[1]);
                const endTime = this.parseSrtTimeInternal(timeMatch[2]);
                let text = lines.slice(startIndex + 1).join('\n').trim().replace(/<[^>]*>/g, '');
                if (text && !isNaN(startTime) && !isNaN(endTime) && endTime > startTime) {
                    vttCues.push(`${this.formatVttTimeInternal(startTime)} --> ${this.formatVttTimeInternal(endTime)}\n${text}\n`);
                }
            }
        });
        return vttCues.join('\n');
    },
    parseAssToVttInternal(assContent) { /* ... your original parseAssToVtt logic ... */
        const vttCues = ['WEBVTT\n'];
        const lines = assContent.split(/\r?\n/);
        let inEventsSection = false;
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine === '[Events]') { inEventsSection = true; continue; }
            if (inEventsSection && trimmedLine.startsWith('[')) { inEventsSection = false; continue; }
            if (!inEventsSection || trimmedLine === '' || trimmedLine.startsWith('Format:')) continue;
            if (trimmedLine.startsWith('Dialogue:')) {
                const parts = trimmedLine.match(/^Dialogue:([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),(.*)/);
                if (parts && parts.length > 10) {
                    const startTimeStr = parts[2].trim();
                    const endTimeStr = parts[3].trim();
                    let text = parts[10].trim().replace(/\{[^}]*\}/g, '').replace(/\\N|\\n/g, '\n');
                    if (startTimeStr && endTimeStr && text) {
                        try {
                            const startTime = this.parseAssTimeInternal(startTimeStr);
                            const endTime = this.parseAssTimeInternal(endTimeStr);
                            if (!isNaN(startTime) && !isNaN(endTime) && endTime > startTime) {
                                vttCues.push(`${this.formatVttTimeInternal(startTime)} --> ${this.formatVttTimeInternal(endTime)}\n${text}\n`);
                            }
                        } catch (e) { console.warn('ASS time parse error', e); }
                    }
                }
            }
        }
        return vttCues.join('\n');
    },
    // Time parsing helpers (internal to VideoPlayer component)
    parseSrtTimeInternal(timeStr) { const parts = timeStr.split(','); const [h, m, s] = parts[0].split(':').map(Number); const ms = Number(parts[1] || 0); return h * 3600 + m * 60 + s + ms / 1000; },
    parseAssTimeInternal(timeStr) { const parts = timeStr.split(':'); const h = Number(parts[0] || 0); const m = Number(parts[1] || 0); const sParts = parts[2].split('.'); const s = Number(sParts[0] || 0); const cs = Number(sParts[1] || 0); return h * 3600 + m * 60 + s + cs / 100; },
    formatVttTimeInternal(seconds) { if (isNaN(seconds) || seconds < 0) return '00:00:00.000'; const ms = Math.round(seconds * 1000); const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); const s = Math.floor((ms % 60000) / 1000); const milli = ms % 1000; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`; },

  }
};
</script>

<style scoped>
.video-player-container {
  flex-grow: 1; /* Take available space */
  background-color: #000;
  border-radius: 8px;
  overflow: hidden;
  aspect-ratio: 16 / 9; /* Maintain aspect ratio */
  position: relative; /* For video-js absolute positioning */
  border: 1px solid var(--panel-border);
}
.video-player-container .video-js {
    width: 100% !important;
    height: 100% !important;
    position: absolute !important; /* Ensure it fills the container */
}
/* Add Video.js theme overrides here if needed, similar to your original CSS */
.video-js .vjs-big-play-button { /* Example */
  background-color: rgba(0, 123, 255, 0.7);
  border-radius: 50%;
}
</style>