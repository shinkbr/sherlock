import { describe, it, expect } from 'vitest';
import { parseImage } from '../js/parsers-image.js';
import { parsePDF } from '../js/parsers-document.js';
import { parseAudio } from '../js/parsers-audio.js';
import { parsePE, parsePESections, parsePEImports } from '../js/parsers-binary.js';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESOURCES_DIR = path.join(__dirname, 'resources');

function readFile(filename) {
    const filePath = path.join(RESOURCES_DIR, filename);
    const buffer = fs.readFileSync(filePath);
    return buffer; // Return Node buffer directly, check if parsers handle it
}

describe('Resource Tests', () => {
    it('analyzes JPG correctly', async () => {
        const buf = readFile('DSCN0012.jpg');
        // Create a copy to ensure standard Uint8Array
        const buffer = new Uint8Array(
            buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
        );

        const { metadata } = await parseImage(buffer);

        expect(metadata.Make).toBe('NIKON');
        expect(metadata.Model).toBe('COOLPIX P6000');
        // Check for specific fields known to be in the sample if checked manually, or just check existence
        // DSCN0012.jpg is a common sample, usually has Exif.
        expect(metadata.DateTimeOriginal).toBe('10/22/2008, 4:29:49 PM');
    });

    it('analyzes HEIC correctly', async () => {
        const buf = readFile('IMG_5195.HEIC');
        const buffer = new Uint8Array(
            buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
        );
        const { metadata, gps } = await parseImage(buffer);

        // HEIC parsing depends on exifr support
        // Assuming exifr handles general metadata extraction
        expect(metadata.Make).toBe('Apple');
        expect(metadata.Model).toBe('iPhone 11 Pro Max');
        expect(gps).toBeDefined();
        if (gps) {
            expect(gps.lat).toBe(39.05134444444444);
            expect(gps.lon).toBe(-94.28877222222222);
        }
    });

    it('analyzes PDF correctly', async () => {
        const buffer = readFile('c4611_sample_explain.pdf');
        const metadata = await parsePDF(buffer);

        expect(metadata.Encryption).toBe('Not encrypted');
        expect(metadata['PDF Version']).toBe('1.3'); // Based on previous output
    });

    it('analyzes MP3 correctly', async () => {
        const buffer = readFile('file_example_MP3_700KB.mp3');
        const metadata = parseAudio(
            { name: 'file_example_MP3_700KB.mp3' },
            buffer.buffer,
            'MP3 Audio'
        );

        // This sample only has ID3 tags, no MPEG frame parsing in parser logic
        expect(metadata['ID3v2 Version']).toBe('2.3');
        // Based on previous output: 'ID3v2 Size': '109 Bytes'
        expect(metadata['ID3v2 Size']).toBe('109 Bytes');
    });

    it('analyzes PE correctly', () => {
        const buf = readFile('ctrl2cap.exe');
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

        const { metadata, e_lfanew } = parsePE(view);

        // Check basic metadata
        // Machine 0x14c is i386 (32-bit)
        expect(metadata.Machine).toBe('14c');
        expect(metadata.Compiled).toBe('Thu, 13 Feb 2025 17:25:27 GMT');

        const sections = parsePESections(view, e_lfanew);
        expect(sections.length).toBe(5);
        expect(sections.map((s) => s.name)).toEqual([
            '.text',
            '.rdata',
            '.data',
            '.rsrc',
            '.reloc'
        ]);

        const imports = parsePEImports(view, e_lfanew);
        expect(Object.keys(imports)).toEqual(
            expect.arrayContaining(['KERNEL32.dll', 'USER32.dll', 'GDI32.dll', 'ADVAPI32.dll'])
        );
        expect(imports['KERNEL32.dll']).toContain('CreateFileW');
        expect(imports['USER32.dll']).toContain('SendMessageW');
    });
});
