import { vi } from 'vitest';
import { parseVideo } from '../js/parsers-media.js';

const encoder = new TextEncoder();

function typeToBytes(type) {
    return type.split('').map((c) => c.charCodeAt(0));
}

function makeBox(type, payload) {
    const box = new Uint8Array(8 + payload.length);
    const view = new DataView(box.buffer);
    view.setUint32(0, box.length);
    typeToBytes(type).forEach((b, i) => (box[4 + i] = b));
    box.set(payload, 8);
    return box;
}

function concatBoxes(...boxes) {
    const totalLength = boxes.reduce((sum, b) => sum + b.length, 0);
    const out = new Uint8Array(totalLength);
    let offset = 0;
    for (const b of boxes) {
        out.set(b, offset);
        offset += b.length;
    }
    return out;
}

function makeMvhdBox(timescale, durationSeconds, creationEpoch) {
    const payload = new Uint8Array(32);
    const view = new DataView(payload.buffer);
    view.setUint8(0, 0); // version
    view.setUint32(4, creationEpoch, false); // creation time at offset 12 from box start
    view.setUint32(12, timescale, false); // timescale offset 20
    view.setUint32(16, durationSeconds * timescale, false); // duration offset 24
    return makeBox('mvhd', payload);
}

function makeTkhdBox(width, height) {
    const payload = new Uint8Array(104);
    const view = new DataView(payload.buffer);
    view.setUint8(0, 0);
    // Offsets are relative to full box start, so subtract header (8 bytes) when writing payload.
    view.setUint32(68, width * 65536, false);
    view.setUint32(72, height * 65536, false);
    return makeBox('tkhd', payload);
}

function makeMdhdBox(timescale, durationSeconds) {
    const payload = new Uint8Array(32);
    const view = new DataView(payload.buffer);
    view.setUint8(0, 0);
    view.setUint32(12, timescale, false);
    view.setUint32(16, durationSeconds * timescale, false);
    return makeBox('mdhd', payload);
}

function makeHdlrBox(handler) {
    const payload = new Uint8Array(32);
    typeToBytes(handler).forEach((b, i) => (payload[8 + i] = b));
    return makeBox('hdlr', payload);
}

function makeStsdBox(codec) {
    const entry = new Uint8Array(16);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, entry.length, false);
    typeToBytes(codec).forEach((b, i) => (entry[4 + i] = b));

    const payload = new Uint8Array(8 + entry.length);
    const view = new DataView(payload.buffer);
    view.setUint32(4, 1, false); // entry count at offset 12 from box start
    payload.set(entry, 8);
    return makeBox('stsd', payload);
}

function makeTrack(handler, width, height, codec, durationSeconds) {
    const tkhd = makeTkhdBox(width, height);
    const mdhd = makeMdhdBox(1000, durationSeconds);
    const hdlr = makeHdlrBox(handler);
    const stsd = makeStsdBox(codec);
    const stbl = makeBox('stbl', stsd);
    const minf = makeBox('minf', stbl);
    const mdia = makeBox('mdia', concatBoxes(mdhd, hdlr, minf));
    return makeBox('trak', concatBoxes(tkhd, mdia));
}

function buildMp4Buffer() {
    const mvhd = makeMvhdBox(1000, 5, 2082844800 + 1000);
    const videoTrak = makeTrack('vide', 1920, 1080, 'avc1', 5);
    const audioTrak = makeTrack('soun', 0, 0, 'mp4a', 5);
    const udta = makeBox('udta', encoder.encode('Location:+37.1234,-122.5678'));
    const moov = makeBox('moov', concatBoxes(mvhd, videoTrak, audioTrak, udta));
    const ftyp = makeBox('ftyp', new Uint8Array(8));
    return concatBoxes(ftyp, moov).buffer;
}

describe('parsers-media parseVideo', () => {
    it('extracts MP4 metadata and falls back to DOM metadata', async () => {
        const buffer = buildMp4Buffer();
        const file = new Blob([buffer], { type: 'video/mp4' });
        file.name = 'clip.mp4';

        const videoStub = {
            preload: '',
            src: '',
            set onloadedmetadata(fn) {
                this._onload = fn;
                fn();
            },
            set onerror(fn) {
                this._onerror = fn;
            },
            get duration() {
                return 7;
            },
            get videoWidth() {
                return 1920;
            },
            get videoHeight() {
                return 1080;
            }
        };
        vi.spyOn(document, 'createElement').mockReturnValue(videoStub);

        const result = await parseVideo(file, buffer, '0000002066747970');
        expect(result.metadata['Video Tracks']).toMatch(/avc1/);
        expect(result.metadata['Video Tracks']).toMatch(/1920x1080/);
        expect(result.metadata['Audio Tracks']).toMatch(/mp4a/);
        expect(result.metadata['Resolution']).toBe('1920x1080');
        expect(result.gps).toMatchObject({ lat: 37.1234, lon: -122.5678 });
    });

    it('parses MP4 V1 boxes (64-bit) and colr box', async () => {
        // Construct V1 mvhd
        // version 1: 1 byte
        // creation time: 8 bytes (offset 4+8=12)
        // mod time: 8 bytes
        // timescale: 4 bytes (offset 4+8+8 = 20 + 8 = 28)
        // duration: 8 bytes (offset 32)

        const mvhdV1 = new Uint8Array(120); // enough size
        const v = new DataView(mvhdV1.buffer);
        v.setUint32(0, mvhdV1.length);
        v.setUint8(4, 0x6d);
        v.setUint8(5, 0x76);
        v.setUint8(6, 0x68);
        v.setUint8(7, 0x64); // mvhd
        v.setUint8(8, 1); // version 1
        v.setBigUint64(12 + 8, 2082844800n + 5000n, false); // creation (at offset 12 in box? no, header is 8, ver is 1 (off 8).
        // parseMvhd: version = view.getUint8(box.start + 8);
        // creationOffset = ver==1 ? box.start+12 (Wait? Line 52: const creationOffset = version === 1 ? box.start + 12 : box.start + 12;)
        // Both are +12?
        // Line 52 in parsers-media.js says: `const creationOffset = version === 1 ? box.start + 12 : box.start + 12;`
        // 64-bit creation time is usually at offset 12 (after version+flags).
        // 32-bit creation time is also at offset 12.
        // But 64-bit is 8 bytes. 32-bit is 4 bytes.
        // So modification time offset is different.
        // timescaleOffset = ver==1 ? start+28 : start+20.
        // durationOffset = ver==1 ? start+32 : start+24.

        v.setBigUint64(12, BigInt(2082844800 + 5000), false); // Creation time (using 64-bit space, but value small)
        v.setUint32(28, 1000, false); // timescale
        v.setBigUint64(32, 5000n, false); // duration

        // Wrap in moov
        const moov = makeBox('moov', mvhdV1);
        const buffer = concatBoxes(makeBox('ftyp', new Uint8Array(4)), moov).buffer;

        const res = await parseVideo({}, buffer, '66747970');
        expect(res.metadata['Duration']).toBe('0m 5s'); // 5000 / 1000
    });

    it('extracts metadata from raw text hints', async () => {
        // Regex requires 3 digits for longitude: [+-]\d{3}\.\d+
        // Regex separator is [, ] (one char). So we use space only.
        const text =
            'Some header data... \nlocation: +40.7128 -074.0060\nencoder: Lavf58.29.100\n2024-01-01 12:00:00 shoot time';
        const buffer = encoder.encode(text).buffer;

        // Mock video fail to force text hint usage
        const videoStub = {
            set onloadedmetadata(fn) {},
            set onerror(fn) {
                fn();
            },
            src: ''
        };
        vi.spyOn(document, 'createElement').mockReturnValue(videoStub);

        const res = await parseVideo({}, buffer, '');
        // We look for substring match because extractTextHints returns just the coordinates
        expect(res.metadata['Location']).toContain('40.7128, -074.0060');
        expect(res.metadata['Encoder']).toBe('Lavf58.29.100');
        expect(res.metadata['Creation Time']).toContain('2024-01-01');
    });

    it('handles malformed boxes gracefully', async () => {
        const buffer = new ArrayBuffer(20);
        // Only ftyp
        const view = new DataView(buffer);
        view.setUint32(0, 8, false);
        view.setUint8(4, 0x66); // ftyp

        // Truncated afterwards
        const res = await parseVideo({}, buffer, '66747970');
        expect(res.metadata).toEqual({}); // No moov found
    });
});
