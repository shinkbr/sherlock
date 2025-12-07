import {
    bufferToHex,
    calculateEntropy,
    calculateHashes,
    crc32,
    extractStrings,
    formatBytes,
    getMagicBytes,
    identifyFileType,
    isLikelyText,
    readFileAsArrayBuffer
} from '../src/utils/helpers.js';

describe('helpers', () => {
    it('reads a Blob as an ArrayBuffer', async () => {
        const data = new Uint8Array([1, 2, 3, 4]);
        const blob = new Blob([data]);
        const result = await readFileAsArrayBuffer(blob);
        expect(new Uint8Array(result)).toEqual(data);
    });

    it('gets magic bytes with offsets applied', () => {
        const buffer = new Uint8Array([0x00, 0x4d, 0x5a, 0x90, 0xff]).buffer;
        const view = new DataView(buffer);
        expect(getMagicBytes(view)).toBe('004D5A90');
        expect(getMagicBytes(view, 3, 2)).toBe('5A90FF');
    });

    it('computes crc32 and cryptographic hashes', async () => {
        const buffer = new TextEncoder().encode('hello').buffer;
        const hashes = await calculateHashes(buffer);
        expect(hashes.md5).toBe('5d41402abc4b2a76b9719d911017c592');
        expect(hashes.sha1).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
        expect(hashes.sha256).toBe(
            '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
        );
        const expectedCrc = crc32(buffer).toString(16).padStart(8, '0');
        expect(hashes.crc32).toBe(expectedCrc);
    });

    it('calculates entropy over a byte buffer', () => {
        const u8 = new Uint8Array(256);
        for (let i = 0; i < 256; i++) u8[i] = i;
        const result = calculateEntropy(u8);
        expect(result.value).toBeCloseTo(8, 5);
        expect(result.percentage).toBeCloseTo(100, 4);
    });

    it('converts buffers to hexadecimal strings', () => {
        const buffer = new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer;
        expect(bufferToHex(buffer)).toBe('deadbeef');
    });

    it('formats bytes into human readable strings', () => {
        expect(formatBytes(0)).toBe('0 Bytes');
        expect(formatBytes(1024)).toBe('1 KB');
        expect(formatBytes(1048576)).toBe('1 MB');
    });

    it('identifies file types using signatures and MP4 ftyp', () => {
        const buf = new ArrayBuffer(16);
        const view = new DataView(buf);
        view.setUint32(4, 0x66747970);
        expect(identifyFileType(view, '4D5A')).toBe('Windows Executable (PE)');
        expect(identifyFileType(view, '000000206674797000000000')).toBe('ISO Media / MP4');
    });

    it('detects likely text buffers', () => {
        const text = new TextEncoder().encode('Hello world\nThis is text');
        const binary = new Uint8Array([0x00, 0xff, 0x10, 0x01, 0x00]);
        expect(isLikelyText(text)).toBe(true);
        expect(isLikelyText(binary)).toBe(false);
    });

    it('extracts printable strings from binary buffers', () => {
        const bytes = new Uint8Array([
            0x00,
            0x41,
            0x42,
            0x43,
            0x00, // "ABC"
            0x7f,
            0x44,
            0x45,
            0x46,
            0x47,
            0x00 // "DEFG"
        ]);
        expect(extractStrings(bytes, 3)).toEqual(['ABC', 'DEFG']);
    });
});
