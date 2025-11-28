const SECONDS_BETWEEN_1904_AND_1970 = 2082844800; // QuickTime epoch difference

    function readString(view, offset, length) {
        return Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join('');
    }

    function readBoxHeaders(view, start, end) {
        const boxes = [];
        let offset = start;
        while (offset + 8 <= end) {
            let size = view.getUint32(offset);
            const type = readString(view, offset + 4, 4);
            let headerSize = 8;
            offset += 8;
            if (size === 0) {
                size = end - offset + 8;
            } else if (size === 1 && offset + 8 <= end) {
                const high = view.getUint32(offset);
                const low = view.getUint32(offset + 4);
                size = Number((BigInt(high) << 32n) | BigInt(low));
                offset += 8;
                headerSize = 16;
            }
            const boxStart = offset - headerSize;
            const boxEnd = boxStart + size;
            if (boxEnd > end || size < 8) break;
            boxes.push({ type, start: boxStart, size, end: boxEnd, headerSize });
            offset = boxEnd;
        }
        return boxes;
    }

    function findFirstBox(view, parent, target) {
        const contentStart = parent.start + (parent.headerSize || 0);
        const boxes = readBoxHeaders(view, contentStart, parent.end);
        return boxes.find(b => b.type === target);
    }

    function findChildBoxes(view, parent, target) {
        const contentStart = parent.start + (parent.headerSize || 0);
        const boxes = readBoxHeaders(view, contentStart, parent.end);
        return boxes.filter(b => b.type === target);
    }

    function parseMvhd(view, box) {
        try {
            const version = view.getUint8(box.start + 8);
            const timescaleOffset = version === 1 ? box.start + 28 : box.start + 20;
            const durationOffset = version === 1 ? box.start + 32 : box.start + 24;
            const creationOffset = version === 1 ? box.start + 12 : box.start + 12;
            const timescale = view.getUint32(timescaleOffset);
            const duration = version === 1 ? Number(view.getBigUint64(durationOffset)) : view.getUint32(durationOffset);
            const creation = version === 1 ? Number(view.getBigUint64(creationOffset)) : view.getUint32(creationOffset);
            const seconds = timescale ? duration / timescale : 0;
            const createdAt = new Date((creation - SECONDS_BETWEEN_1904_AND_1970) * 1000);
            return { durationSeconds: seconds, createdAt };
        } catch (e) { return {}; }
    }

    function parseTkhd(view, box) {
        try {
            const version = view.getUint8(box.start + 8);
            const widthOffset = version === 1 ? box.start + 92 : box.start + 76;
            const heightOffset = version === 1 ? box.start + 96 : box.start + 80;
            const width = view.getUint32(widthOffset) / 65536;
            const height = view.getUint32(heightOffset) / 65536;
            return { width, height };
        } catch (e) { return {}; }
    }

    function parseHdlr(view, box) {
        try {
            const handler = readString(view, box.start + 16, 4);
            return handler;
        } catch (e) { return null; }
    }

    function parseMdhd(view, box) {
        try {
            const version = view.getUint8(box.start + 8);
            const timescaleOffset = version === 1 ? box.start + 28 : box.start + 20;
            const durationOffset = version === 1 ? box.start + 32 : box.start + 24;
            const timescale = view.getUint32(timescaleOffset);
            const duration = version === 1 ? Number(view.getBigUint64(durationOffset)) : view.getUint32(durationOffset);
            const seconds = timescale ? duration / timescale : 0;
            return { timescale, duration: seconds };
        } catch (e) { return {}; }
    }

    function parseStsd(view, box) {
        try {
            const entryCount = view.getUint32(box.start + 12);
            const entries = [];
            let offset = box.start + 16;
            for (let i = 0; i < entryCount; i++) {
                const size = view.getUint32(offset);
                const type = readString(view, offset + 4, 4);
                entries.push({ type, size, start: offset, end: offset + size });
                offset += size;
            }
            return entries;
        } catch (e) { return []; }
    }

    function parseColr(view, sampleEntry) {
        try {
            let offset = sampleEntry.start + 8; // skip size+type
            // Skip fixed fields of visual sample entry (per ISO/IEC 14496-12)
            offset += 6 + 2 + 2 + 2 + 12 + 2 + 2 + 4 + 4 + 4 + 32 + 2 + 2;
            while (offset + 8 <= sampleEntry.end) {
                const size = view.getUint32(offset);
                const type = readString(view, offset + 4, 4);
                if (type === 'colr') {
                    const colourType = readString(view, offset + 8, 4);
                    if (colourType === 'nclx') {
                        const primaries = view.getUint16(offset + 12);
                        const transfer = view.getUint16(offset + 14);
                        const matrix = view.getUint16(offset + 16);
                        const fullRange = (view.getUint8(offset + 18) & 0x80) !== 0;
                        return `nclx P:${primaries} T:${transfer} M:${matrix} ${fullRange ? 'Full' : 'Limited'}`;
                    } else {
                        return colourType;
                    }
                }
                if (size < 8) break;
                offset += size;
            }
        } catch (e) { }
        return null;
    }

    function formatSeconds(sec) {
        if (!sec || !isFinite(sec)) return "Unknown";
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        if (h > 0) return `${h}h ${m}m ${s}s`;
        return `${m}m ${s}s`;
    }

    function parseMp4Metadata(buffer) {
        const view = new DataView(buffer);
        const root = { start: 0, end: buffer.byteLength, headerSize: 0 };
        const top = readBoxHeaders(view, root.start, root.end);
        const moov = top.find(b => b.type === 'moov');
        if (!moov) return {};

        const meta = {};
        const mvhd = findFirstBox(view, moov, 'mvhd');
        if (mvhd) {
            const mvhdData = parseMvhd(view, mvhd);
            if (mvhdData.durationSeconds) meta["Duration"] = formatSeconds(mvhdData.durationSeconds);
            if (mvhdData.createdAt && !isNaN(mvhdData.createdAt)) meta["Creation Time"] = mvhdData.createdAt.toLocaleString();
        }

        const udta = findFirstBox(view, moov, 'udta');
        if (udta) {
            const metaBox = findFirstBox(view, udta, 'meta');
            if (metaBox) {
                const rawText = readString(view, metaBox.start, Math.min(4096, metaBox.size));
                const encoderMatch = rawText.match(/©too.{0,4}([^\0]+)/);
                if (encoderMatch && encoderMatch[1]) meta["Encoder"] = encoderMatch[1].trim();
                const creationMatch = rawText.match(/©day.{0,4}([^\0]+)/);
                if (creationMatch && creationMatch[1] && !meta["Creation Time"]) meta["Creation Time"] = creationMatch[1].trim();
                const locInMeta = extractISO6709(rawText);
                if (locInMeta && !meta["Location"]) meta["Location"] = locInMeta;
            }
            const rawUdta = readString(view, udta.start, Math.min(4096, udta.size));
            const locMatch = rawUdta.match(/([+-]\d{2}\.\d+)[, ]([+-]\d{3}\.\d+)/);
            if (locMatch) meta["Location"] = `${locMatch[1]}, ${locMatch[2]}`;
        }

        const traks = findChildBoxes(view, moov, 'trak');
        const videoTracks = [];
        const audioTracks = [];
        traks.forEach(trak => {
            const tkhd = findFirstBox(view, trak, 'tkhd');
            const mdia = findFirstBox(view, trak, 'mdia');
            if (!mdia) return;
            const hdlr = findFirstBox(view, mdia, 'hdlr');
            const handler = hdlr ? parseHdlr(view, hdlr) : null;
            const mdhd = findFirstBox(view, mdia, 'mdhd');
            const mdhdInfo = mdhd ? parseMdhd(view, mdhd) : {};
            const minf = findFirstBox(view, mdia, 'minf');
            let codec = null;
            let colr = null;
            if (minf) {
                const stbl = findFirstBox(view, minf, 'stbl');
                if (stbl) {
                    const stsd = findFirstBox(view, stbl, 'stsd');
                    const entries = stsd ? parseStsd(view, stsd) : [];
                    if (entries.length) {
                        codec = entries.map(e => e.type).join(', ');
                        if (handler === 'vide') {
                            const colrBox = parseColr(view, entries[0]);
                            if (colrBox) colr = colrBox;
                        }
                    }
                }
            }
            const trackInfo = {};
            if (handler === 'vide') {
                const dims = tkhd ? parseTkhd(view, tkhd) : {};
                trackInfo.type = "Video";
                trackInfo.codec = codec || "Unknown";
                if (dims.width && dims.height) trackInfo.resolution = `${Math.round(dims.width)}x${Math.round(dims.height)}`;
                if (mdhdInfo.duration) trackInfo.duration = formatSeconds(mdhdInfo.duration);
                if (colr) trackInfo.color = colr;
                videoTracks.push(trackInfo);
            } else if (handler === 'soun') {
                trackInfo.type = "Audio";
                trackInfo.codec = codec || "Unknown";
                if (mdhdInfo.duration) trackInfo.duration = formatSeconds(mdhdInfo.duration);
                audioTracks.push(trackInfo);
            }
        });

        if (videoTracks.length) meta["Video Tracks"] = videoTracks.map(v => {
            const parts = [v.codec];
            if (v.resolution) parts.push(v.resolution);
            if (v.duration) parts.push(v.duration);
            if (v.color) parts.push(`Color: ${v.color}`);
            return parts.filter(Boolean).join(" | ");
        }).join("\n");

        if (audioTracks.length) meta["Audio Tracks"] = audioTracks.map(a => {
            const parts = [a.codec];
            if (a.duration) parts.push(a.duration);
            return parts.filter(Boolean).join(" | ");
        }).join("\n");

        return meta;
    }

    function extractISO6709(text) {
        const match = text.match(/([+-]\d{2}\.\d{3,})([+-]\d{3}\.\d{3,})/);
        if (match) return `${match[1]}, ${match[2]}`;
        const spaced = text.match(/([+-]\d{2}\.\d{3,})[, ]([+-]\d{3}\.\d{3,})/);
        if (spaced) return `${spaced[1]}, ${spaced[2]}`;
        return null;
    }

    function parseLocationString(loc) {
        if (!loc) return null;
        const match = loc.match(/([+-]?\d+(?:\.\d+)?)[, ]+([+-]?\d+(?:\.\d+)?)/);
        if (!match) return null;
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        if (isNaN(lat) || isNaN(lon)) return null;
        return { lat, lon };
    }

    function extractTextHints(buffer) {
        try {
            const sample = buffer.slice(0, Math.min(buffer.byteLength, 1024 * 1024));
            const text = new TextDecoder().decode(sample);
            const isoLoc = extractISO6709(text);
            const locationMatch = text.match(/([+-]\d{2}\.\d+)[, ]([+-]\d{3}\.\d+)/);
            const encoderMatch = text.match(/encoder[:=]([\w .-]+)/i);
            const dateMatch = text.match(/(20\d{2}[-/]\d{2}[-/]\d{2}[^\s]*)/);
            return {
                location: isoLoc || (locationMatch ? `${locationMatch[1]}, ${locationMatch[2]}` : null),
                encoder: encoderMatch ? encoderMatch[1].trim() : null,
                shotTime: dateMatch ? dateMatch[1] : null
            };
        } catch (e) { return {}; }
    }

    async function parseVideo(file, buffer, magicHex) {
        let meta = {};
        // Attempt structured MP4/MOV parsing
        if (magicHex && magicHex.toUpperCase().includes("66747970")) {
            const mp4Meta = parseMp4Metadata(buffer);
            meta = Object.assign(meta, mp4Meta);
        }

        // Fallback: attempt HTML5 video probe for duration/resolution
        try {
            const video = document.createElement('video');
            video.preload = 'metadata';
            const domMeta = await new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    resolve({
                        "Duration": `${Math.floor(video.duration / 60)}m ${Math.floor(video.duration % 60)}s`,
                        "Resolution": `${video.videoWidth}x${video.videoHeight}`
                    });
                };
                video.onerror = () => resolve({});
                video.src = URL.createObjectURL(file);
            });
            meta = Object.assign({}, domMeta, meta);
        } catch (e) { }

        // Lightweight text search hints for formats not covered
        const hints = extractTextHints(buffer);
        if (hints.location && !meta["Location"]) meta["Location"] = hints.location;
        if (hints.encoder && !meta["Encoder"]) meta["Encoder"] = hints.encoder;
        if (hints.shotTime && !meta["Creation Time"]) meta["Creation Time"] = hints.shotTime;

        // Ensure we have a label for resolution if we parsed it in video tracks
        if (!meta["Resolution"] && meta["Video Tracks"]) {
            const firstRes = meta["Video Tracks"].split("\n").map(r => r.match(/(\\d+x\\d+)/)).find(Boolean);
            if (firstRes && firstRes[1]) meta["Resolution"] = firstRes[1];
        }

        let gps = null;
        if (!gps && meta["Location"]) gps = parseLocationString(meta["Location"]);
        if (!gps && hints.location) gps = parseLocationString(hints.location);

        return { metadata: meta, gps };
    }

export { parseVideo };
