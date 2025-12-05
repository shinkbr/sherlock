import { formatBytes } from './helpers.js';

function readString(view, offset, length) {
    if (offset + length > view.byteLength) return '';
    let str = '';
    for (let i = 0; i < length; i++) {
        const c = view.getUint8(offset + i);
        if (c !== 0) str += String.fromCharCode(c);
    }
    return str;
}

function parseID3v1(view) {
    const end = view.byteLength;
    if (end < 128) return null;

    // Check for "TAG" at end-128
    const tag = readString(view, end - 128, 3);
    if (tag !== 'TAG') return null;

    const title = readString(view, end - 125, 30).trim();
    const artist = readString(view, end - 95, 30).trim();
    const album = readString(view, end - 65, 30).trim();
    const year = readString(view, end - 35, 4).trim();
    const comment = readString(view, end - 31, 30).trim();
    const genre = view.getUint8(end - 1);

    return {
        Title: title,
        Artist: artist,
        Album: album,
        Year: year,
        Comment: comment,
        'ID3v1 Genre ID': genre
    };
}

function parseID3v2(view) {
    // Basic ID3v2 header check
    if (view.byteLength < 10) return null;
    const sig = readString(view, 0, 3);
    if (sig !== 'ID3') return null;

    const version = view.getUint8(3);
    const flags = view.getUint8(5);
    // Synch-safe integer for size
    const size =
        (view.getUint8(6) << 21) |
        (view.getUint8(7) << 14) |
        (view.getUint8(8) << 7) |
        view.getUint8(9);

    const metadata = {
        'ID3v2 Version': `2.${version}`,
        'ID3v2 Size': formatBytes(size)
    };

    // Full frame parsing is complex, just returning header info for now
    // as it covers the requirement to "analyze" without fully re-implementing a large library.
    // If specific tags are needed, we can scan frames.

    return metadata;
}

function parseWAV(view) {
    try {
        if (view.byteLength < 44) return {};
        // RIFF header checked by caller or identifyFileType
        // fmt chunk usually starts at 12
        let offset = 12;
        let fmtParsed = false;
        let dataParsed = false;
        const meta = {};

        while (offset + 8 <= view.byteLength) {
            const chunkId = readString(view, offset, 4);
            const chunkSize = view.getUint32(offset + 4, true);

            if (chunkId === 'fmt ' && chunkSize >= 16) {
                const audioFormat = view.getUint16(offset + 8, true);
                const numChannels = view.getUint16(offset + 10, true);
                const sampleRate = view.getUint32(offset + 12, true);
                const byteRate = view.getUint32(offset + 16, true);
                const blockAlign = view.getUint16(offset + 20, true);
                const bitsPerSample = view.getUint16(offset + 22, true);

                meta['Format'] = audioFormat === 1 ? 'PCM' : `Compressed (${audioFormat})`;
                meta['Channels'] = numChannels;
                meta['Sample Rate'] = `${sampleRate} Hz`;
                meta['Bits Per Sample'] = bitsPerSample;
                fmtParsed = true;
            } else if (chunkId === 'data') {
                if (fmtParsed) {
                    const sampleRate = parseInt(meta['Sample Rate']);
                    const channels = meta['Channels'];
                    const bits = meta['Bits Per Sample'];
                    if (sampleRate && channels && bits) {
                        const duration = chunkSize / (sampleRate * channels * (bits / 8));
                        meta['Duration'] = `${duration.toFixed(2)} sec`;
                    }
                }
                dataParsed = true;
            }

            offset += 8 + chunkSize;
            // Pad byte if odd
            if (chunkSize % 2 !== 0) offset++;
        }

        return meta;
    } catch {
        return {};
    }
}

function parseFLAC(view) {
    try {
        if (view.byteLength < 4) return {};
        const sig = readString(view, 0, 4);
        if (sig !== 'fLaC') return {};

        const meta = {};

        // Metadata blocks
        let offset = 4;
        let isLast = false;

        while (!isLast && offset < view.byteLength) {
            const header = view.getUint8(offset);
            isLast = (header & 0x80) !== 0;
            const type = header & 0x7f;
            const length =
                (view.getUint8(offset + 1) << 16) |
                (view.getUint8(offset + 2) << 8) |
                view.getUint8(offset + 3);

            offset += 4;

            if (type === 0) {
                // STREAMINFO
                const minBlock = view.getUint16(offset, false);
                const maxBlock = view.getUint16(offset + 2, false);
                const minFrame =
                    (view.getUint8(offset + 4) << 16) |
                    (view.getUint8(offset + 5) << 8) |
                    view.getUint8(offset + 6);
                const maxFrame =
                    (view.getUint8(offset + 7) << 16) |
                    (view.getUint8(offset + 8) << 8) |
                    view.getUint8(offset + 9);

                const b10 = view.getUint8(offset + 10);
                const b11 = view.getUint8(offset + 11);
                const b12 = view.getUint8(offset + 12);

                const sampleRate = (b10 << 12) | (b11 << 4) | ((b12 & 0xf0) >> 4);
                const channels = ((b12 & 0x0e) >> 1) + 1;
                const bps = (((b12 & 0x01) << 4) | ((view.getUint8(offset + 13) & 0xf0) >> 4)) + 1;

                const totalSamplesStr =
                    (BigInt(view.getUint8(offset + 13) & 0x0f) << 32n) |
                    BigInt(view.getUint32(offset + 14, false));

                meta['Sample Rate'] = `${sampleRate} Hz`;
                meta['Channels'] = channels;
                meta['Bits Per Sample'] = bps;

                if (sampleRate > 0) {
                    const duration = Number(totalSamplesStr) / sampleRate;
                    meta['Duration'] = `${duration.toFixed(2)} sec`;
                }
            } else if (type === 4) {
                // VORBIS_COMMENT
                // Skip Vendor String
                const vendorLen = view.getUint32(offset, true);
                let p = offset + 4 + vendorLen;

                const commentListLen = view.getUint32(p, true);
                p += 4;

                for (let i = 0; i < commentListLen; i++) {
                    const len = view.getUint32(p, true);
                    p += 4;
                    const comment = readString(view, p, len);
                    p += len;

                    const [key, val] = comment.split('=');
                    if (key && val) {
                        // Standardize keys a bit
                        const normKey = key.trim().toUpperCase();
                        if (['TITLE', 'ARTIST', 'ALBUM', 'DATE', 'GENRE'].includes(normKey)) {
                            meta[key.trim()] = val.trim();
                        }
                    }
                }
            }

            offset += length;
        }

        return meta;
    } catch (e) {
        console.error('FLAC Parse Error', e);
        return {};
    }
}

function parseAudio(file, buffer, type) {
    const view = new DataView(buffer);
    let meta = {};

    if (type.includes('MP3')) {
        const id3v1 = parseID3v1(view);
        const id3v2 = parseID3v2(view);
        if (id3v1) meta = { ...meta, ...id3v1 };
        if (id3v2) meta = { ...meta, ...id3v2 };
    } else if (type.includes('WAV')) {
        meta = parseWAV(view);
    } else if (type.includes('FLAC')) {
        meta = parseFLAC(view);
    }

    // OGG is complex to parse via simple DataView due to page structure,
    // often best handled by checking for 'vorbis' signatures in first pages.
    // Minimal check for OggS header:
    if (type.includes('OGG') && readString(view, 0, 4) === 'OggS') {
        meta['Container'] = 'Ogg';
        // Scan for 'vorbis' string in first few KB
        const initialChunk = buffer.slice(0, 4096);
        const txt = new TextDecoder().decode(initialChunk);
        if (txt.includes('vorbis')) meta['Codec'] = 'Vorbis';
        if (txt.includes('theora')) meta['Codec'] = 'Theora';
        if (txt.includes('opus')) meta['Codec'] = 'Opus';
    }

    return meta;
}

export { parseAudio };
