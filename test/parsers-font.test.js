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
});
