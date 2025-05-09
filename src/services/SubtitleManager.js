// src/services/SubtitleManager.js

// 字幕解析函数（从 VideoPlayer.vue 移到这里，并设为私有辅助函数）
function parseVttToVttInternal(vttContent) {
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
}

function parseSrtTimeInternal(timeStr) {
  const parts = timeStr.split(',');
  const [h, m, s] = parts[0].split(':').map(Number);
  const ms = Number(parts[1] || 0);
  return h * 3600 + m * 60 + s + ms / 1000;
}

function formatVttTimeInternal(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00:00.000';
  const totalMilliseconds = Math.round(seconds * 1000);
  const hours = String(Math.floor(totalMilliseconds / 3600000)).padStart(2, '0');
  const minutes = String(Math.floor((totalMilliseconds % 3600000) / 60000)).padStart(2, '0');
  const secs = String(Math.floor((totalMilliseconds % 60000) / 1000)).padStart(2, '0');
  const millis = String(totalMilliseconds % 1000).padStart(3, '0');
  return `${hours}:${minutes}:${secs}.${millis}`;
}

function parseSrtToVttInternal(srtContent) {
  const vttCues = ['WEBVTT\n'];
  const blocks = srtContent.replace(/\r\n|\r/g, '\n').trim().split(/\n\n+/);
  blocks.forEach((block) => {
    const lines = block.split('\n');
    if (!lines || lines.length < 2) return;
    let timeLineIndex = 0;
    if (/^\d+$/.test(lines[0].trim()) && lines.length > 1 && lines[1].includes('-->')) {
      timeLineIndex = 1;
    } else if (!lines[0].includes('-->')) {
      return;
    }
    const timeMatch = lines[timeLineIndex].match(/(\d{1,2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{3})/);
    if (timeMatch) {
      const startTime = parseSrtTimeInternal(timeMatch[1].replace('.', ','));
      const endTime = parseSrtTimeInternal(timeMatch[2].replace('.', ','));
      let text = lines.slice(timeLineIndex + 1).join('\n').trim();
      text = text.replace(/<[^>]*>/g, '');
      if (text && !isNaN(startTime) && !isNaN(endTime) && endTime > startTime) {
        const vttStartTime = formatVttTimeInternal(startTime);
        const vttEndTime = formatVttTimeInternal(endTime);
        vttCues.push(`${vttStartTime} --> ${vttEndTime}\n${text}\n`);
      }
    }
  });
  return vttCues.join('\n');
}

function parseAssTimeInternal(timeStr) {
  const parts = timeStr.split(':');
  const h = Number(parts[0] || 0);
  const m = Number(parts[1] || 0);
  const sParts = parts[2].split('.');
  const s = Number(sParts[0] || 0);
  const cs = Number(sParts[1] || 0);
  return h * 3600 + m * 60 + s + cs / 100;
}

function parseAssToVttInternal(assContent) {
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
          const startTime = parseAssTimeInternal(startTimeStr);
          const endTime = parseAssTimeInternal(endTimeStr);
          if (!isNaN(startTime) && !isNaN(endTime) && endTime > startTime) {
            const vttStartTime = formatVttTimeInternal(startTime);
            const vttEndTime = formatVttTimeInternal(endTime);
            vttCues.push(`${vttStartTime} --> ${vttEndTime}\n${text.trim()}\n`);
          }
        } catch (e) { /* ignore parsing errors for individual lines */ }
      }
    }
  }
  return vttCues.join('\n');
}

function getFilenameFromUrl(url) {
    if (!url) return 'unknown_subtitle';
    try {
        const path = new URL(url).pathname;
        return decodeURIComponent(path.substring(path.lastIndexOf('/') + 1));
    } catch {
        return url.substring(url.lastIndexOf('/') + 1) || 'unknown_subtitle';
    }
}

function getFileExtension(url) {
    if (!url) return '';
    try {
        const filename = getFilenameFromUrl(url);
        const dotIndex = filename.lastIndexOf('.');
        return dotIndex > 0 ? filename.substring(dotIndex + 1).toLowerCase() : '';
    } catch { return ''; }
}


const subtitleCache = new Map();

export default {
  async fetchAndCacheSubtitle(url) {
    if (!url) {
      return null; // Or throw error, depends on desired behavior
    }
    if (subtitleCache.has(url)) {
      console.log(`SubtitleManager: Returning cached subtitle for ${url}`);
      return subtitleCache.get(url);
    }

    console.log(`SubtitleManager: Fetching subtitle from ${url}`);
    const fileExt = getFileExtension(url);
    const name = getFilenameFromUrl(url);

    if (!['vtt', 'srt', 'ass'].includes(fileExt)) {
      throw new Error(`Unsupported subtitle file type: ${fileExt || 'unknown'}`);
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status} fetching subtitle "${name}"`);
      }
      const textContent = await response.text();

      let vttContent = '';
      if (fileExt === 'vtt') vttContent = parseVttToVttInternal(textContent);
      else if (fileExt === 'srt') vttContent = parseSrtToVttInternal(textContent);
      else if (fileExt === 'ass') vttContent = parseAssToVttInternal(textContent);

      if (!vttContent || !vttContent.includes('-->')) {
        throw new Error(`Failed to parse subtitle "${name}": Empty or invalid VTT content.`);
      }

      const subtitleData = { vttContent, name, ext: fileExt, originalUrl: url };
      subtitleCache.set(url, subtitleData);
      console.log(`SubtitleManager: Cached subtitle for ${url}`);
      return subtitleData;

    } catch (error) {
      console.error(`SubtitleManager: Error fetching/parsing subtitle from ${url}`, error);
      throw error; // Re-throw for App.vue to handle
    }
  },

  getSubtitleFromCache(url) {
    return subtitleCache.get(url) || null;
  },

  clearCache() {
    subtitleCache.clear();
    console.log("SubtitleManager: Cache cleared.");
  },

  removeFromCache(url) {
    if (subtitleCache.has(url)) {
        subtitleCache.delete(url);
        console.log(`SubtitleManager: Removed ${url} from cache.`);
    }
  }
};