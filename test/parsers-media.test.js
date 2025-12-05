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
});
