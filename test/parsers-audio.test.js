import { describe, it, expect } from 'vitest';
import { parseAudio } from '../src/parsers/parsers-audio.js';

describe('Audio Parser', () => {
    it('should parse ID3v1 tags from MP3', () => {
        // Create a mock MP3 with ID3v1 at the end (128 bytes)
        const buffer = new ArrayBuffer(128 + 10);
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

    it('should handle Malformed WAV', () => {
        // Trigger generic catch block in parseWAV
        // Buffer must be >= 44 to pass initial check.
        // We want 'fmt ' chunk access to throw RangeError.
        // fmt reads up to offset+24.
        // If we place 'fmt ' at offset 40, 40+24=64 > 50 (buffer size).
        // To get to 40, we need a filler chunk at 12.
        // 12 + 8 + Size = 40 => Size = 20.

        const buffer = new ArrayBuffer(50);
        const view = new DataView(buffer);

        // Chunk 1 at 12: "JUNK", size 20
        view.setUint8(12, 0x4a); // J
        view.setUint8(13, 0x55); // U
        view.setUint8(14, 0x4e); // N
        view.setUint8(15, 0x4b); // K
        view.setUint32(16, 20, true);

        // Chunk 2 at 40: "fmt ", size 16
        // Loop check: 40 + 8 = 48 <= 50. Safe.
        // Inside: read offset+22 (62) -> throws.
        view.setUint8(40, 0x66); // f
        view.setUint8(41, 0x6d); // m
        view.setUint8(42, 0x74); // t
        view.setUint8(43, 0x20); // ' '
        view.setUint32(44, 16, true);

        const res = parseAudio({}, buffer, 'WAV Audio');
        expect(res).toEqual({});
    });

    it('should parse WAV fmt chunk', () => {
        // Mock WAV header
        // RIFF (4) + Size (4) + WAVE (4) + fmt (4) + Size (4) + AudioFormat(2) + NumChannels(2) + SampleRate(4) ...
        const buffer = new ArrayBuffer(100);
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

        // data chunk at offset 12 + 8 + 16 = 36
        const dataOffset = 36;
        view.setUint8(dataOffset, 0x64); // 'd'
        view.setUint8(dataOffset + 1, 0x61); // 'a'
        view.setUint8(dataOffset + 2, 0x74); // 't'
        view.setUint8(dataOffset + 3, 0x61); // 'a'

        // 44100 * 2 channels * 2 bytes/sample * 1.5 sec = 264600 bytes
        view.setUint32(dataOffset + 4, 264600, true);

        const res = parseAudio({}, buffer, 'WAV Audio');
        expect(res['Sample Rate']).toBe('44100 Hz');
        expect(res['Channels']).toBe(2);
        expect(res['Bits Per Sample']).toBe(16);
        expect(res['Duration']).toBe('1.50 sec');
    });

    it('should parse ID3v2 header', () => {
        // Mock ID3v2
        const buffer = new ArrayBuffer(20);
        const view = new DataView(buffer);
        const list = new Uint8Array(buffer);

        // ID3 header
        list.set([0x49, 0x44, 0x33], 0); // ID3
        view.setUint8(3, 3); // Version 2.3

        // Size: 4 bytes synch-safe.
        // 0x00 0x00 0x02 0x01 => 128 + 1 ??? No wait
        // 0000000 0000000 0000010 0000001
        // (0<<21) | (0<<14) | (2<<7) | 1 = 256 + 1 = 257 bytes
        view.setUint8(6, 0);
        view.setUint8(7, 0);
        view.setUint8(8, 2);
        view.setUint8(9, 1);

        const res = parseAudio({}, buffer, 'MP3 Audio');
        expect(res['ID3v2 Version']).toBe('2.3');
        expect(res['ID3v2 Size']).toBe('257 Bytes');
    });

    it('should parse FLAC header and STREAMINFO', () => {
        const buffer = new ArrayBuffer(60);
        const view = new DataView(buffer);
        const u8 = new Uint8Array(buffer);

        // fLaC
        u8.set([0x66, 0x4c, 0x61, 0x43], 0);

        // Metadata Block Header
        // Last block (1) | Type (0 - STREAMINFO) = 0x80
        view.setUint8(4, 0x80);

        // Length 34 (24 bits)
        view.setUint8(5, 0);
        view.setUint8(6, 0);
        view.setUint8(7, 34);

        // Streaminfo data starts at 8
        // offset 8 + 10 = 18 for Sample Rate / Channels

        // Sample Rate 44100 (0xAC44), 2 channels, 16 bps
        // b10 = AC
        // b11 = 44
        // b12 -> xxxx (SR 4 bits) xxx (Ch 3 bits) x (BPS 1 bit)

        // Sample Rate 44100 (0xAC44)
        // b10 = 0x0A
        // b11 = 0xC4
        // b12 -> 4 (SR low nibble) | 1 (Ch=2) | 0 (BPS high)
        // 0100 001 0 = 0x42

        view.setUint8(18, 0x0a);
        view.setUint8(19, 0xc4);
        view.setUint8(20, 0x42);

        // b13: BPS-low=1111(->16) = 0xF0
        view.setUint8(21, 0xf0);

        // Total Samples = 88200 (2s)
        view.setUint32(22, 88200, false);

        const res = parseAudio({}, buffer, 'FLAC Audio');

        expect(res['Sample Rate']).toBe('44100 Hz');
        expect(res['Channels']).toBe(2);
        expect(res['Bits Per Sample']).toBe(16);
        expect(res['Duration']).toBe('2.00 sec');
    });

    it('should detect OGG container', () => {
        const buffer = new ArrayBuffer(100);
        const u8 = new Uint8Array(buffer);

        // OggS
        u8.set([0x4f, 0x67, 0x67, 0x53], 0);

        // Codec string
        const codecStr = 'vorbis';
        for (let i = 0; i < codecStr.length; i++) {
            u8[50 + i] = codecStr.charCodeAt(i);
        }

        const res = parseAudio({}, buffer, 'OGG Audio');
        expect(res['Container']).toBe('Ogg');
        expect(res['Codec']).toBe('Vorbis');
    });

    it('should parse FLAC Vorbis Comment', () => {
        const buffer = new ArrayBuffer(200);
        const view = new DataView(buffer);
        const u8 = new Uint8Array(buffer);

        // fLaC
        u8.set([0x66, 0x4c, 0x61, 0x43], 0);

        // Block 0: Vorbis Comment (4) | Last (0x80) -> 0x84
        view.setUint8(4, 0x84);

        // Length 50
        view.setUint8(5, 0);
        view.setUint8(6, 0);
        view.setUint8(7, 50);

        // Offset 8 start.
        // Vendor String Length (4 bytes LE) = 3
        view.setUint32(8, 3, true);
        // Vendor String (3 bytes)
        u8.set([0x61, 0x62, 0x63], 12); // "abc"

        // Comment List Length (4 bytes LE) at 15
        view.setUint32(15, 1, true); // 1 comment

        // Comment 0 Length (4 bytes LE) at 19
        const commentStr = 'TITLE=Hello';
        view.setUint32(19, commentStr.length, true);

        // Comment string at 23
        for (let i = 0; i < commentStr.length; i++) {
            u8[23 + i] = commentStr.charCodeAt(i);
        }

        const res = parseAudio({}, buffer, 'FLAC Audio');
        expect(res.TITLE).toBe('Hello');
    });

    it('should handle FLAC parse errors gracefully', () => {
        const buffer = new ArrayBuffer(10);
        const u8 = new Uint8Array(buffer);
        // fLaC
        u8.set([0x66, 0x4c, 0x61, 0x43], 0);
        // Malformed block header causing huge length
        const view = new DataView(buffer);
        view.setUint8(4, 0x00);
        view.setUint8(5, 0xff);
        view.setUint8(6, 0xff);
        view.setUint8(7, 0xff);

        const res = parseAudio({}, buffer, 'FLAC Audio');
        expect(res).toEqual({});
    });

    it('should detect OGG container codecs', () => {
        const buffer = new ArrayBuffer(100);
        const u8 = new Uint8Array(buffer);
        u8.set([0x4f, 0x67, 0x67, 0x53], 0); // OggS

        // Theora
        const codecStr = 'theora';
        for (let i = 0; i < codecStr.length; i++) u8[50 + i] = codecStr.charCodeAt(i);
        let res = parseAudio({}, buffer, 'OGG Audio');
        expect(res.Codec).toBe('Theora');

        // Opus
        const codecStr2 = 'opus';
        for (let i = 0; i < codecStr2.length; i++) u8[50 + i] = codecStr2.charCodeAt(i);
        res = parseAudio({}, buffer, 'OGG Audio');
        expect(res.Codec).toBe('Opus');
    });
});
