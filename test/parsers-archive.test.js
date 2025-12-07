import JSZip from 'jszip';
import pako from 'pako';
import { parseGzip, parseTarArchive, parseZipContents } from '../src/parsers/parsers-archive.js';

const encoder = new TextEncoder();

function createTarArchive(name, content) {
    const header = new Uint8Array(512);
    header.set(encoder.encode(name), 0);
    const sizeOctal = content.length.toString(8).padStart(11, '0') + '\0';
    header.set(encoder.encode(sizeOctal), 124);
    header[156] = '0'.charCodeAt(0);

    const dataSize = Math.ceil(content.length / 512) * 512;
    const data = new Uint8Array(dataSize);
    data.set(content);

    const end = new Uint8Array(512);
    const combined = new Uint8Array(header.length + data.length + end.length);
    combined.set(header, 0);
    combined.set(data, header.length);
    combined.set(end, header.length + data.length);
    return combined;
}

beforeAll(() => {
    window.pako = pako;
    window.JSZip = JSZip;
});

describe('parsers-archive', () => {
    it('parses tar archives into file listings', () => {
        const tar = createTarArchive('file.txt', encoder.encode('abc'));
        const result = parseTarArchive(tar);
        expect(result.files).toEqual([
            { name: 'file.txt', dir: false, size: '3 Bytes', crc: 'N/A', encrypted: false }
        ]);
    });

    it('parses gzip metadata and embedded tar contents', () => {
        const tar = createTarArchive('inner.txt', encoder.encode('hello'));
        const gz = pako.gzip(tar);
        const file = { name: 'archive.tar.gz' };
        const result = parseGzip(file, gz.buffer, 'tgz');
        expect(result.metadata['GZIP Method']).toBe('Deflate');
        expect(result.metadata['GZIP OS']).toBeDefined();
        expect(result.files[0].name).toBe('inner.txt');
    });

    it('parses zip archives via central directory', async () => {
        const zip = new JSZip();
        zip.file('hello.txt', 'hi');
        const content = await zip.generateAsync({ type: 'uint8array' });
        const file = { arrayBuffer: async () => content.buffer, name: 'sample.zip' };
        const result = await parseZipContents(file);
        expect(result.files[0]).toMatchObject({ name: 'hello.txt', dir: false, encrypted: false });
        expect(result.encrypted).toBe(false);
    });

    it('handles GZIP flags (Comment, Extra, CRC)', () => {
        // Hand-craft a GZIP header with flags
        // ID1(1f) ID2(8b) CM(08) FLG...
        // FLG bits: FTEXT(1), FHCRC(2), FEXTRA(4), FNAME(8), FCOMMENT(16)
        // We set 2|4|8|16 = 30 -> 0x1E?
        // 0001 1110 = 0x1E

        const buffer = new ArrayBuffer(100);
        const view = new DataView(buffer);
        const u8 = new Uint8Array(buffer);

        u8[0] = 0x1f;
        u8[1] = 0x8b;
        u8[2] = 0x08;
        u8[3] = 0x1e; // Flags: CRC, Extra, Name, Comment

        let offset = 10;

        // FEXTRA (0x04): XLEN (2 bytes) + Data
        view.setUint16(offset, 4, true); // 4 bytes extra
        offset += 2;
        u8[offset++] = 0xaa;
        u8[offset++] = 0xbb;
        u8[offset++] = 0xcc;
        u8[offset++] = 0xdd;

        // FNAME (0x08): Null-terminated string
        const name = 'test.txt';
        for (let i = 0; i < name.length; i++) u8[offset++] = name.charCodeAt(i);
        u8[offset++] = 0; // null

        // FCOMMENT (0x10): Null-terminated string
        const comment = 'My Comment';
        for (let i = 0; i < comment.length; i++) u8[offset++] = comment.charCodeAt(i);
        u8[offset++] = 0; // null

        // FHCRC (0x02): 2 bytes CRC16
        offset += 2;

        const res = parseGzip({}, buffer, 'gz');
        expect(res.metadata['Original Name']).toBe('test.txt');
        expect(res.metadata['Comment']).toBe('My Comment');
        // We mock pako to handle bad compressed data or just empty data?
        // parseGzip calls pako.ungzip if it looks like tar.
        // name is test.txt, not tar. So no ungzip attempt unless ext='tgz' passed.
    });

    it('handles malformed GZIP (too small)', () => {
        const buffer = new ArrayBuffer(5);
        const res = parseGzip({}, buffer);
        expect(res.metadata['GZIP Error']).toBe('File too small');
    });

    it('parses Encrypted Zip using Central Directory', async () => {
        // Mock a zip central directory with encrypted bit set
        const buffer = new ArrayBuffer(200);
        const view = new DataView(buffer);
        const u8 = new Uint8Array(buffer);
        const len = u8.length;

        // EOCD at end
        // Signature 0x06054b50 at len-22
        view.setUint32(len - 22, 0x06054b50, true);
        view.setUint16(len - 22 + 10, 1, true); // 1 entry
        view.setUint32(len - 22 + 16, 0, true); // Offset of CD: 0

        // Central Directory Header at 0
        // Signature 0x02014b50
        view.setUint32(0, 0x02014b50, true);
        // Flags (offset 8): Bit 0 = Encrypted (0x01)
        view.setUint16(8, 1, true);

        // Name Length (offset 28) = 4
        view.setUint16(28, 4, true);
        // Name "test" at 46
        u8.set([0x74, 0x65, 0x73, 0x74], 46);

        const file = { arrayBuffer: async () => buffer };
        const res = await parseZipContents(file);

        expect(res.files[0].name).toBe('test');
        expect(res.files[0].encrypted).toBe(true);
        expect(res.encrypted).toBe(true);
    });

    it('falls back to JSZip on malformed Central Directory', async () => {
        // Empty buffer -> no EOCD found -> returns fallback immediately inside parseCentralDirectory?
        // Wait, parseZipContents catches exception?
        // Code: `if (eocdOffset === -1) return fallbackResult;` inside parseCentralDirectory.
        // Then `if (central.files.length > 0) return central;`
        // So if CD parsing fails (empty files), it proceeds to JSZip fallback.

        // We want CD parsing to return {files:[]} so it falls back to JSZip.
        // EOCD not found returns {files:[], encrypted:null}.

        // Mock JSZip.loadAsync
        const mockZip = {
            forEach: (cb) => {
                cb('fallback.txt', {
                    dir: false,
                    _data: { uncompressedSize: 100, crc32: 12345 },
                    encrypted: false
                });
            },
            files: {}
        };
        const loadAsyncSpy = vi.spyOn(JSZip, 'loadAsync').mockResolvedValue(mockZip);

        const file = { arrayBuffer: async () => new ArrayBuffer(100) }; // No EOCD
        const res = await parseZipContents(file);

        expect(res.files[0].name).toBe('fallback.txt');
        expect(loadAsyncSpy).toHaveBeenCalled();
    });
});
