import * as ParsersModule from '../src/parsers/index.js';
import { identifyFileType } from '../src/utils/helpers.js';

describe('parsers index re-exports', () => {
    it('matches direct exports to Parsers object', () => {
        expect(ParsersModule.identifyFileType).toBe(identifyFileType);
        expect(ParsersModule.Parsers.parseVideo).toBe(ParsersModule.parseVideo);
        expect(Object.keys(ParsersModule.Parsers)).toContain('parsePDF');
    });
});
