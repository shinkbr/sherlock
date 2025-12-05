import { describe, it, expect } from 'vitest';
import { parseAudio } from '../js/parsers-audio.js';

describe('Audio Parser', () => {
    it('should parse ID3v1 tags from MP3', () => {
        // Create a mock MP3 with ID3v1 at the end (128 bytes)
        const buffer = new ArrayBuffer(128 + 10);
        const view = new DataView(buffer);
        const u8 = new Uint8Array(buffer);

        // Fill "MP3 data"
        for (let i = 0; i < 10; i++) u8[i] = 0xff; // sync

        // Write TAG
        const tagOffset = 10;
        u8.set([0x54, 0x41, 0x47], tagOffset); // TAG

        // Title: "Hit Me" (30 bytes)
        const title = 'Hit Me';
        for (let i = 0; i < title.length; i++) u8[tagOffset + 3 + i] = title.charCodeAt(i);

        // Artist: "Britney" (30 bytes)
        const artist = 'Britney';
        for (let i = 0; i < artist.length; i++) u8[tagOffset + 33 + i] = artist.charCodeAt(i);

        const res = parseAudio({}, buffer, 'MP3 Audio (ID3)');
        expect(res.Title).toBe('Hit Me');
        expect(res.Artist).toBe('Britney');
    });

    it('should parse WAV fmt chunk', () => {
        // Mock WAV header
        // RIFF (4) + Size (4) + WAVE (4) + fmt (4) + Size (4) + AudioFormat(2) + NumChannels(2) + SampleRate(4) ...
        const buffer = new ArrayBuffer(44);
        const view = new DataView(buffer);

        // RIFF header skipped by parser usually, but let's be safe

        // fmt chunk at offset 12
        // id: 'fmt '
        view.setUint8(12, 0x66);
        view.setUint8(13, 0x6d);
        view.setUint8(14, 0x74);
        view.setUint8(15, 0x20);
        view.setUint32(16, 16, true); // size 16
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, 2, true); // Stereo
        view.setUint32(24, 44100, true); // 44.1kHz
        view.setUint16(34, 16, true); // 16-bit

        const res = parseAudio({}, buffer, 'WAV Audio');
        expect(res['Sample Rate']).toBe('44100 Hz');
        expect(res['Channels']).toBe(2);
        expect(res['Bits Per Sample']).toBe(16);
    });
});
