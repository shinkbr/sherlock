import { describe, it, expect } from 'vitest';
import { parseFont } from '../js/parsers-font.js';

describe('Font Parser', () => {
    it('should identify WOFF header', () => {
        const buffer = new ArrayBuffer(44);
        const view = new DataView(buffer);

        // wOFF
        view.setUint8(0, 0x77);
        view.setUint8(1, 0x4f);
        view.setUint8(2, 0x46);
        view.setUint8(3, 0x46);
        // OTTO
        view.setUint8(4, 0x4f);
        view.setUint8(5, 0x54);
        view.setUint8(6, 0x54);
        view.setUint8(7, 0x4f);
        // Length
        view.setUint32(8, 1000, false);
        // Version 1.0
        view.setUint16(24, 1, false);
        view.setUint16(26, 0, false);

        const res = parseFont(buffer);
        expect(res.Format).toBe('Web Open Font Format (WOFF)');
        expect(res.Flavor).toBe('OpenType');
        expect(res.Version).toBe('1.0');
    });

    it('should identify WOFF2 header', () => {
        const buffer = new ArrayBuffer(44);
        const view = new DataView(buffer);

        // wOF2
        view.setUint8(0, 0x77);
        view.setUint8(1, 0x4f);
        view.setUint8(2, 0x46);
        view.setUint8(3, 0x32);
        // OTTO
        view.setUint8(4, 0x4f);
        view.setUint8(5, 0x54);
        view.setUint8(6, 0x54);
        view.setUint8(7, 0x4f);
        // Length
        view.setUint32(8, 2000, false);

        const res = parseFont(buffer);
        expect(res.Format).toBe('Web Open Font Format 2.0 (WOFF2)');
        expect(res.Flavor).toBe('OpenType');
        expect(res.Length).toBe(2000);
    });

    it('should parse TTF/OTF Name table', () => {
        // Construct minimal TTF with Name table
        const buffer = new ArrayBuffer(200);
        const view = new DataView(buffer);
        const u8 = new Uint8Array(buffer);

        // SFNT Version 0x00010000 (TrueType)
        view.setUint32(0, 0x00010000, false);
        // Num Tables: 1
        view.setUint16(4, 1, false);

        // Table Record 0: "name"
        // tag
        u8.set([0x6e, 0x61, 0x6d, 0x65], 12);
        // Checksum (ignore)
        // Offset: 32 (12 + 16*1 + padding=4 > 32)
        view.setUint32(12 + 8, 32, false);
        // Length
        view.setUint32(12 + 12, 100, false);

        // Name Table at offset 32
        const nameOffset = 32;
        // Format selector (0)
        view.setUint16(nameOffset, 0, false);
        // Count (1 record)
        view.setUint16(nameOffset + 2, 1, false);
        // Offset to string storage (from start of name table) = 6 + 12*1 = 18
        view.setUint16(nameOffset + 4, 18, false);

        // Name Record 0
        const recOffset = nameOffset + 6;
        // PlatformID: 1 (Mac)
        view.setUint16(recOffset, 1, false);
        // EncodingID: 0 (Roman)
        view.setUint16(recOffset + 2, 0, false);
        // LanguageID (0 - English)
        view.setUint16(recOffset + 4, 0, false);
        // NameID: 1 (Font Family)
        view.setUint16(recOffset + 6, 1, false);
        // Length: 5 "Arial"
        view.setUint16(recOffset + 8, 5, false);
        // Offset: 0 (from string storage)
        view.setUint16(recOffset + 10, 0, false);

        // String Storage at nameOffset + 18 = 32 + 18 = 50
        const strOffset = 50;
        const nameStr = 'Arial';
        for (let i = 0; i < nameStr.length; i++) {
            u8[strOffset + i] = nameStr.charCodeAt(i);
        }

        const res = parseFont(buffer);
        expect(res.Format).toBe('TrueType (TTF)');
        expect(res['Font Family']).toBe('Arial');
    });
});
