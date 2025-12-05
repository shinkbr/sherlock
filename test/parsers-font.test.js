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

    it('should parse TTF UTF-16BE strings (Windows platform)', () => {
        const buffer = new ArrayBuffer(200);
        const view = new DataView(buffer);
        const u8 = new Uint8Array(buffer);

        view.setUint32(0, 0x00010000, false);
        view.setUint16(4, 1, false);

        // Record 0 "name"
        u8.set([0x6e, 0x61, 0x6d, 0x65], 12);
        view.setUint32(20, 32, false); // Offset
        view.setUint32(24, 100, false); // Length

        const nameOffset = 32;
        view.setUint16(nameOffset, 0, false);
        view.setUint16(nameOffset + 2, 1, false);
        view.setUint16(nameOffset + 4, 18, false); // String offset at 32+18=50

        // Platform 3 (Windows), Encoding 1 (Unicode BMP)
        const recOffset = nameOffset + 6;
        view.setUint16(recOffset, 3, false);
        view.setUint16(recOffset + 2, 1, false);
        view.setUint16(recOffset + 4, 1033, false);
        view.setUint16(recOffset + 6, 1, false); // Family

        // "Arial" in UTF-16BE: 00 41 00 72 00 69 00 61 00 6C
        view.setUint16(recOffset + 8, 10, false); // Length 10 bytes
        view.setUint16(recOffset + 10, 0, false);

        const strOffset = 50;
        const str = "Arial";
        for (let i = 0; i < str.length; i++) {
            view.setUint16(strOffset + i * 2, str.charCodeAt(i), false);
        }

        const res = parseFont(buffer);
        expect(res['Font Family']).toBe('Arial');
    });

    it('should handle Font Name Table parse errors', () => {
        const buffer = new ArrayBuffer(50);
        const view = new DataView(buffer);
        const u8 = new Uint8Array(buffer);

        view.setUint32(0, 0x00010000, false);
        view.setUint16(4, 1, false);

        // Record 0 "name"
        u8.set([0x6e, 0x61, 0x6d, 0x65], 12);
        view.setUint32(20, 32, false);
        view.setUint32(24, 100, false);

        // Buffer ends at 50, but we try to read Name table at 32
        // It says count is huge
        const nameOffset = 32;
        view.setUint16(nameOffset, 0, false);
        view.setUint16(nameOffset + 2, 5000, false); // Huge count, loop triggers read out of bounds

        // Should catch and return partial meta
        const res = parseFont(buffer);
        expect(res.Format).toBe('TrueType (TTF)');
        // No crash
    });
    it('should parse TTF Mac Roman strings and various Name IDs', () => {
        const buffer = new ArrayBuffer(500);
        const view = new DataView(buffer);
        const u8 = new Uint8Array(buffer);

        view.setUint32(0, 0x00010000, false);
        view.setUint16(4, 1, false); // 1 table

        // name table
        u8.set([0x6e, 0x61, 0x6d, 0x65], 12);
        view.setUint32(20, 32, false);
        view.setUint32(24, 200, false);

        const nameOffset = 32;
        // Count: 5 records
        view.setUint16(nameOffset + 2, 5, false);
        // String offset: 32 + 6 + 12*5 = 98
        const storageStart = 98;
        view.setUint16(nameOffset + 4, storageStart, false);

        // Helper to write record
        let recIdx = 0;
        const addRecord = (nid, strVal) => {
            const rBase = nameOffset + 6 + recIdx * 12;
            view.setUint16(rBase, 1, false); // Platform Mac
            view.setUint16(rBase + 2, 0, false); // Encoding Roman
            view.setUint16(rBase + 4, 0, false); // Language
            view.setUint16(rBase + 6, nid, false); // NameID
            view.setUint16(rBase + 8, strVal.length, false);

            // Write string at some offset? Simple sequential
            // Let's just put valid offsets.
            // But we need to write the string bytes too.
            // Let's assume sequential storage from 0.
            const currentStrOffset = u8.length - (500 - (nameOffset + storageStart)); // hacky
            // Actually, we can use a growing offset pointer.
        };

        // Simpler approach: Manual records
        // Record 0: NameID 1 (Family) = "MacFamily"
        // Record 1: NameID 2 (Subfamily) = "Regular"
        // Record 2: NameID 4 (Full Name) = "MacFamily Regular"
        // Record 3: NameID 5 (Version) = "1.0"
        // Record 4: NameID 0 (Copyright) = "(c) Me"

        const records = [
            { id: 1, val: "MacFamily" },
            { id: 2, val: "Regular" },
            { id: 4, val: "MacFamily Regular" },
            { id: 5, val: "1.0" },
            { id: 0, val: "Copyright Me" }
        ];

        let currentStringOffset = 0;
        records.forEach((r, i) => {
            const rBase = nameOffset + 6 + i * 12;
            view.setUint16(rBase, 1, false); // Mac
            view.setUint16(rBase + 2, 0, false); // Roman
            view.setUint16(rBase + 4, 0, false); // English
            view.setUint16(rBase + 6, r.id, false);
            view.setUint16(rBase + 8, r.val.length, false);
            view.setUint16(rBase + 10, currentStringOffset, false);

            // Write string bytes
            for (let c = 0; c < r.val.length; c++) {
                u8[nameOffset + storageStart + currentStringOffset + c] = r.val.charCodeAt(c);
            }
            currentStringOffset += r.val.length;
        });

        const res = parseFont(buffer);
        expect(res['Font Family']).toBe('MacFamily');
        expect(res['Subfamily']).toBe('Regular');
        expect(res['Full Name']).toBe('MacFamily Regular');
        expect(res['Version']).toBe('1.0');
        expect(res['Copyright']).toBe('Copyright Me');
    });

    it('should identify WOFF TrueType Flavor', () => {
        const buffer = new ArrayBuffer(44);
        const view = new DataView(buffer);
        // wOFF
        view.setUint8(0, 0x77); view.setUint8(1, 0x4f); view.setUint8(2, 0x46); view.setUint8(3, 0x46);
        // Flavor NOT OTTO -> TrueType (e.g. 0x00010000)
        view.setUint32(4, 0x00010000, false);

        // Length 100
        view.setUint32(8, 100, false);
        // Version 1.0
        view.setUint16(24, 1, false);
        view.setUint16(26, 0, false);

        const res = parseFont(buffer);
        expect(res.Flavor).toBe('TrueType');
    });
});
