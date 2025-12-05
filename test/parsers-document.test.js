import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { formatPDFDate, parseOfficeXML, parsePDF } from '../js/parsers-document.js';

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
        expect(metadata.Encryption).toBe('Encrypted');
        expect(metadata['Comments/Annotations']).toBeUndefined();
    });

    it('parses Office OpenXML properties from a zip', async () => {
        window.JSZip = JSZip;
        const zip = new JSZip();
        zip.file('docProps/app.xml', `<Properties>
            <Company>ACME Co</Company>
            <Manager>Manager Name</Manager>
            <Application>Word</Application>
            <AppVersion>16.0</AppVersion>
        </Properties>`);
        zip.file('docProps/core.xml', `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
            <dc:creator>Carol</dc:creator>
            <cp:lastModifiedBy>Dave</cp:lastModifiedBy>
            <dcterms:created>2024-01-01</dcterms:created>
            <dcterms:modified>2024-01-02</dcterms:modified>
            <dc:subject>Subject</dc:subject>
            <dc:title>Title</dc:title>
            <cp:keywords>tag1,tag2</cp:keywords>
        </cp:coreProperties>`);
        zip.file('xl/workbook.xml', `<workbook><sheets><sheet name="HiddenSheet" state="hidden"/></sheets></workbook>`);
        zip.file('xl/comments1.xml', `<comments xmlns:w="w"><w:comment w:author="Alice"><w:p><w:r><w:t>This is a comment.</w:t></w:r></w:p></w:comment></comments>`);

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
        zip.file('word/media/image1.jpg', new Uint8Array([0xFF, 0xD8, 0xFF])); // Pseudo JPEG

        const blob = await zip.generateAsync({ type: 'uint8array' });
        const props = await parseOfficeXML(new Blob([blob]));

        expect(props['Embedded Files']).toBe('1 found');
        expect(props['Embedded EXIF']).toContain('image1.jpg');
        expect(props['Embedded EXIF']).toContain('CameraMaker');
        expect(props['Embedded EXIF']).toContain('CameraModel');
        expect(props['Embedded EXIF']).toContain('GPS: 35.6895, 139.6917'); // Approximate format check
    });
});
