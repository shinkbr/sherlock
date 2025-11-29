import JSZip from 'jszip';
import pako from 'pako';
import { parseGzip, parseTarArchive, parseZipContents } from '../js/parsers-archive.js';

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
});
