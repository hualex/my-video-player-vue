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
    videoSrcObj: Object,
    subtitleData: Object, // Expects { vttContent, name, ext, originalUrl } | null
  },
  emits: ['player-ready', 'metadata-loaded', 'player-error', 'player-play'],
  data() {
    return {
      player: null,
      lastAppliedSubtitleUrl: null,
      currentCustomTrackId: null, // Store the ID of our custom track
    };
  },
  watch: {
    videoSrcObj: { /* ... same as before ... */
      deep: true,
      handler(newSrcObj, oldSrcObj) {
        if (this.player && newSrcObj && newSrcObj.src) {
          if (!oldSrcObj || newSrcObj.src !== oldSrcObj.src) {
            console.log('VideoPlayer: New video source. Resetting player for:', newSrcObj.src);
            this.player.reset();
            this.lastAppliedSubtitleUrl = null;
            this.currentCustomTrackId = null; // Reset custom track ID
            this.player.src({ src: newSrcObj.src, type: newSrcObj.type });
          }
        } else if (this.player && !newSrcObj && oldSrcObj) {
          console.log('VideoPlayer: Video source removed. Resetting player.');
          this.player.reset();
          this.lastAppliedSubtitleUrl = null;
          this.currentCustomTrackId = null;
        }
      }
    },
    subtitleData: { /* ... same as before ... */
      deep: true,
      handler(newSubData) {
        if (!this.player || this.player.isDisposed()) return;

        if (newSubData && newSubData.vttContent && newSubData.originalUrl) {
          if (this.player.currentSrc() && newSubData.originalUrl !== this.lastAppliedSubtitleUrl) {
            console.log('VideoPlayer: subtitleData prop changed. Applying new subtitle:', newSubData.name);
            this.addVttToPlayer(newSubData.vttContent, newSubData.name, newSubData.ext);
            this.lastAppliedSubtitleUrl = newSubData.originalUrl;
          } else if (!this.player.currentSrc()) {
            console.log('VideoPlayer: subtitleData received, but no video source yet. Will apply on metadata.');
          }
        } else {
          console.log('VideoPlayer: subtitleData is null or invalid. Removing custom subtitles.');
          this.removePreviousCustomSubtitles(); // This will use currentCustomTrackId
          this.lastAppliedSubtitleUrl = null;
        }
      }
    }
  },
  mounted() {
    this.player = videojs(this.$refs.videoNode, {
        controls: true, autoplay: false, preload: 'auto', fluid: false, aspectRatio: '16:9',
        playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3],
        controlBar: {
            children: [
                'playToggle', 'volumePanel', 'currentTimeDisplay', 'timeDivider',
                'durationDisplay', 'progressControl', 'liveDisplay', 'remainingTimeDisplay',
                'customControlSpacer',
                // Ensure captionsButton or subtitlesButton is included for the UI
                'captionsButton', // This is often the default for subtitles/captions
                // 'subtitlesButton', // Alternative if captionsButton doesn't work as expected
                'chaptersButton', 'descriptionsButton',
                'audioTrackButton', 'pictureInPictureToggle', 'fullscreenToggle',
                'playbackRateMenuButton',
            ]
        }
    }, () => {
      this.$emit('player-ready');
    });

    this.player.on('loadedmetadata', () => { /* ... same as before ... */
      const currentSrc = this.player.currentSrc();
      let videoName = '视频';
       if (currentSrc) {
           try {
               const path = new URL(currentSrc).pathname;
               videoName = decodeURIComponent(path.substring(path.lastIndexOf('/') + 1)) || currentSrc;
           } catch { videoName = currentSrc.substring(currentSrc.lastIndexOf('/')+1) || currentSrc; }
       }
      this.$emit('metadata-loaded', videoName);

      if (this.subtitleData && this.subtitleData.vttContent && this.subtitleData.originalUrl !== this.lastAppliedSubtitleUrl) {
        console.log('VideoPlayer (loadedmetadata): subtitleData available, applying subtitle:', this.subtitleData.name);
        this.addVttToPlayer(this.subtitleData.vttContent, this.subtitleData.name, this.subtitleData.ext);
        this.lastAppliedSubtitleUrl = this.subtitleData.originalUrl;
      } else if (!this.subtitleData && this.lastAppliedSubtitleUrl) {
        console.log('VideoPlayer (loadedmetadata): No new subtitleData, clearing lastAppliedSubtitleUrl.');
        this.removePreviousCustomSubtitles();
        this.lastAppliedSubtitleUrl = null;
      }
    });

    this.player.on('error', () => { /* ... same as before ... */
        const error = this.player.error();
        let msg = '播放器发生错误';
        if (error) { msg += `: ${error.message || '未知错误'} (Code: ${error.code || 'N/A'})`; }
        console.error('VideoPlayer Error:', msg);
        this.$emit('player-error', msg);
    });
    this.player.on('play', () => this.$emit('player-play'));

    if (this.videoSrcObj && this.videoSrcObj.src) {
      this.player.src({ src: this.videoSrcObj.src, type: this.videoSrcObj.type });
    }
  },
  beforeUnmount() { /* ... same as before ... */
    if (this.player && !this.player.isDisposed()) {
      this.player.dispose();
      this.player = null;
    }
  },
  methods: {
    removePreviousCustomSubtitles() {
      if (!this.player || this.player.isDisposed()) return;
      const tracks = this.player.textTracks();

      // If we have a stored ID for our custom track, try to remove that specifically
      if (this.currentCustomTrackId) {
        for (let i = 0; i < tracks.length; i++) {
          if (tracks[i].id === this.currentCustomTrackId) {
            try {
              this.player.removeRemoteTextTrack(tracks[i]);
              console.log(`VideoPlayer: Removed custom subtitle track with ID: ${this.currentCustomTrackId}`);
            } catch (err) {
              console.warn("Error removing text track by ID:", err);
            }
            this.currentCustomTrackId = null;
            return; // Exit after removing the specific track
          }
        }
         // If track with ID wasn't found (e.g. after player reset), clear the ID
        this.currentCustomTrackId = null;
      }

      // Fallback: remove any other data URI tracks if no specific ID was found or matched
      // This is more of a cleanup for unexpected states.
      const dataUriTracksToRemove = [];
      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].src && tracks[i].src.startsWith('data:text/vtt')) {
            dataUriTracksToRemove.push(tracks[i]);
        }
      }
      if (dataUriTracksToRemove.length > 0) {
        dataUriTracksToRemove.forEach(track => {
            try { this.player.removeRemoteTextTrack(track); }
            catch (err) { console.warn("Error removing data URI text track:", err); }
        });
        console.log("VideoPlayer: Removed", dataUriTracksToRemove.length, "fallback data URI subtitle track(s).");
      }
    },

    addVttToPlayer(vttContent, name, ext) {
      if (!this.player || this.player.isDisposed() || !vttContent) return;
      this.removePreviousCustomSubtitles(); // Remove any existing custom track first

      const subtitleDataUrl = `data:text/vtt;charset=utf-8,${encodeURIComponent(vttContent)}`;
      let trackLabel = name ? (name.substring(0, name.lastIndexOf('.')) || name) : '字幕';
      if (ext) trackLabel += ` (${ext.toUpperCase()})`;

      // Generate a unique-ish ID for our track so we can specifically remove it later
      const trackId = `custom-subtitle-${Date.now()}`;

      try {
        const newTrackData = {
          id: trackId, // Assign an ID
          kind: 'subtitles',
          label: trackLabel,
          language: 'zxx', // 'und' (undetermined) or 'zxx' (no linguistic content) are good choices
          src: subtitleDataUrl,
          // Default mode for new tracks is 'disabled'. User can enable it via CC button.
          // If you want it to show immediately: mode: 'showing'
          // However, it's often better to let Video.js manage the 'default' attribute of the <track>
          // or let the user choose.
          // Forcing `default: true` might not always work as expected with dynamic tracks.
        };

        this.player.addRemoteTextTrack(newTrackData, false);
        this.currentCustomTrackId = trackId; // Store the ID of the added track

        // After adding, find the track and set its mode to 'showing' if you want it to be active by default.
        // Video.js's CC button should then allow toggling it.
        this.$nextTick(() => {
            const tracks = this.player.textTracks();
            for (let i = 0; i < tracks.length; i++) {
                if (tracks[i].id === this.currentCustomTrackId) {
                    // Set to 'showing' to make it visible immediately.
                    // The user can then turn it off via the CC button.
                    tracks[i].mode = 'showing';
                    console.log(`VideoPlayer: Added and set mode to 'showing' for track: ${trackLabel} (ID: ${this.currentCustomTrackId})`);
                    break;
                }
            }
            // Ensure the captions button UI updates if it wasn't visible before
             if (this.player.controlBar.getChild('SubsCapsButton')) { // Video.js 7+ uses SubsCapsButton
                this.player.controlBar.getChild('SubsCapsButton').show();
            } else if (this.player.controlBar.getChild('CaptionsButton')) { // Older versions
                this.player.controlBar.getChild('CaptionsButton').show();
            }
        });

        console.log('VideoPlayer: Subtitle VTT content added to player:', trackLabel);
      } catch (err) {
        console.error('VideoPlayer: Error adding VTT content to player:', err);
        this.$emit('player-error', `添加字幕轨道失败: ${err.message}`);
        this.currentCustomTrackId = null; // Clear ID on error
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
  }
};
</script>

<style scoped>
/* Styles (same as before) */
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