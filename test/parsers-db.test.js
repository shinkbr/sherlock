import { describe, it, expect } from 'vitest';
import { parseSQLite } from '../src/parsers/parsers-db.js';

describe('SQLite Parser', () => {
    it('should identify SQLite 3 header and page size', () => {
        const buffer = new ArrayBuffer(100);
        const view = new DataView(buffer);
        const u8 = new Uint8Array(buffer);

        // "SQLite format 3\0"
        const sig = 'SQLite format 3\0';
        for (let i = 0; i < sig.length; i++) u8[i] = sig.charCodeAt(i);

        // Page size at offset 16 (Big Endian)
        view.setUint16(16, 4096, false);

        // Version valid for at 92
        view.setUint32(92, 3007002, false);

        const res = parseSQLite(buffer);
        expect(res.Format).toBe('SQLite Database (v3)');
        expect(res['Page Size']).toBe(4096);
        expect(res['Version Valid For']).toBe(3007002);
    });
});
