import * as ParsersModule from '../js/parsers.js';
import { identifyFileType } from '../js/helpers.js';

describe('parsers index re-exports', () => {
    it('matches direct exports to Parsers object', () => {
        expect(ParsersModule.identifyFileType).toBe(identifyFileType);
        expect(ParsersModule.Parsers.parseVideo).toBe(ParsersModule.parseVideo);
        expect(Object.keys(ParsersModule.Parsers)).toContain('parsePDF');
    });
});
