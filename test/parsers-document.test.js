import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { formatPDFDate, parseOfficeXML, parsePDF } from '../src/parsers/parsers-document.js';

vi.mock('exifr', () => ({
    default: {
        parse: vi.fn().mockResolvedValue({
            Make: 'CameraMaker',
            Model: 'CameraModel',
            DateTimeOriginal: '2024:01:01 12:00:00',
            GPSLatitude: 35.6895,
            GPSLongitude: 139.6917
        })
    }
}));

// Mock pdfjs-dist
const mockGetDocument = vi.fn();
vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: (...args) => mockGetDocument(...args)
}));

// Mock worker import
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'mock-worker-url' }));

describe('parsers-document', () => {
    it('formats PDF date strings into locale output', () => {
        const formatted = formatPDFDate('D:20240101123000Z');
        expect(formatted).toBe(new Date('2024-01-01T12:30:00Z').toLocaleString());
        expect(formatPDFDate('not-a-date')).toBe('not-a-date');
    });

    it('parses PDF metadata from raw text', async () => {
        const pdfText = `%PDF-1.7
/Title (Sample)
/Author (Unit Tester)
/Creator (Creator App)
/Producer (Producer)
/Subject (Subject Line)
/CreationDate (D:20240101120000Z)
/ModDate (D:20240102130000Z)
/Annots [1 0 R]
/Encrypt`;
        const buffer = new TextEncoder().encode(pdfText).buffer;
        const metadata = await parsePDF(buffer);
        expect(metadata['PDF Version']).toBe('1.7');
        expect(metadata.Title).toBe('Sample');
        expect(metadata.Author).toBe('Unit Tester');
        expect(metadata['Producer / Software']).toBe('Producer');
        expect(metadata.Encryption).toBe('Not encrypted');
        expect(metadata['Comments/Annotations']).toBeUndefined();
    });

    it('parses Office OpenXML properties from a zip', async () => {
        window.JSZip = JSZip;
        const zip = new JSZip();
        zip.file(
            'docProps/app.xml',
            `<Properties>
            <Company>ACME Co</Company>
            <Manager>Manager Name</Manager>
            <Application>Word</Application>
            <AppVersion>16.0</AppVersion>
        </Properties>`
        );
        zip.file(
            'docProps/core.xml',
            `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
            <dc:creator>Carol</dc:creator>
            <cp:lastModifiedBy>Dave</cp:lastModifiedBy>
            <dcterms:created>2024-01-01</dcterms:created>
            <dcterms:modified>2024-01-02</dcterms:modified>
            <dc:subject>Subject</dc:subject>
            <dc:title>Title</dc:title>
            <cp:keywords>tag1,tag2</cp:keywords>
        </cp:coreProperties>`
        );
        zip.file(
            'xl/workbook.xml',
            `<workbook><sheets><sheet name="HiddenSheet" state="hidden"/></sheets></workbook>`
        );
        zip.file(
            'xl/comments1.xml',
            `<comments xmlns:w="w"><w:comment w:author="Alice"><w:p><w:r><w:t>This is a comment.</w:t></w:r></w:p></w:comment></comments>`
        );

        const blob = await zip.generateAsync({ type: 'uint8array' });
        const props = await parseOfficeXML(new Blob([blob]));

        expect(props.Company).toBe('ACME Co');
        expect(props['Last Modified By']).toBe('Dave');
        expect(props['⚠️ Hidden Sheets']).toContain('HiddenSheet');
        expect(props['Comment Authors']).toContain('Alice');
        expect(props['Comments Content']).toContain('This is a comment.');
    });

    it('analyzes embedded media files for EXIF data', async () => {
        window.JSZip = JSZip;
        const zip = new JSZip();
        zip.file('word/media/image1.jpg', new Uint8Array([0xff, 0xd8, 0xff])); // Pseudo JPEG

        const blob = await zip.generateAsync({ type: 'uint8array' });
        const props = await parseOfficeXML(new Blob([blob]));

        expect(props['Embedded Files']).toBe('1 found');
        expect(props['Embedded EXIF']).toContain('image1.jpg');
        expect(props['Embedded EXIF']).toContain('CameraMaker');
        expect(props['Embedded EXIF']).toContain('CameraModel');
        expect(props['Embedded EXIF']).toContain('GPS: 35.6895, 139.6917'); // Approximate format check
    });

    it('detects Macros in Office files', async () => {
        window.JSZip = JSZip;
        const zip = new JSZip();
        zip.file('word/vbaProject.bin', 'macro content');

        const blob = await zip.generateAsync({ type: 'uint8array' });
        const props = await parseOfficeXML(new Blob([blob]));

        expect(props['⚠️ MACROS DETECTED']).toContain('YES (vbaProject.bin found)');
    });

    it('handles Full PDF parsing with mocked pdf.js', async () => {
        const mockDoc = {
            getMetadata: vi.fn().mockResolvedValue({
                info: {
                    Title: 'Mock Title',
                    Author: 'Mock Author',
                    CreationDate: 'D:20240101120000Z',
                    Keywords: ['Test', 'PDF']
                }
            }),
            numPages: 1,
            getPage: vi.fn().mockResolvedValue({
                getAnnotations: vi
                    .fn()
                    .mockResolvedValue([
                        { contents: 'Annotation content' },
                        { contents: 'Duplicate' },
                        { contents: 'Duplicate' }
                    ])
            }),
            cleanup: vi.fn(),
            isEncrypted: false
        };

        // mocked getDocument returns an object with a promise
        mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockDoc) });

        const buffer = new ArrayBuffer(100);
        // We need to make sure we don't trigger the "header bytes" check that looks for %PDF in simple parsing?
        // Code: `const headerText = ...; setIfValue('PDF Version'...)`
        // Then `try { const loadingTask = pdfjsLib.getDocument(...) }`
        // So it calls getDocument.

        const res = await parsePDF(buffer);

        expect(res.Title).toBe('Mock Title');
        expect(res['Comments/Annotations']).toContain('1 found');
        expect(res['Annotation Comments']).toContain('p1: Annotation content');
        expect(mockGetDocument).toHaveBeenCalled();
    });
});
