import { identifyFileType } from './helpers.js';
import { parseZipContents, parseTarArchive, parseGzip } from './parsers-archive.js';
import {
    parsePE,
    parsePESections,
    parsePESymbols,
    parsePEImports,
    parseELF,
    parseELFSections,
    parseELFSymbols,
    parseELFImports,
    parseMachO
} from './parsers-binary.js';
import { parseVideo } from './parsers-media.js';
import { parsePDF, parseOfficeXML } from './parsers-document.js';
import { parseAudio } from './parsers-audio.js';
import { parseFont } from './parsers-font.js';
import { parseSQLite } from './parsers-db.js';
import { parseImage } from './parsers-image.js';

export {
    identifyFileType,
    parseZipContents,
    parseTarArchive,
    parseGzip,
    parsePE,
    parsePESections,
    parsePESymbols,
    parsePEImports,
    parseELF,
    parseELFSections,
    parseELFSymbols,
    parseELFImports,
    parseMachO,
    parseVideo,
    parsePDF,
    parseOfficeXML,
    parseAudio,
    parseFont,
    parseSQLite
};

export const Parsers = {
    identifyFileType,
    parseZipContents,
    parseTarArchive,
    parseGzip,
    parsePE,
    parsePESections,
    parsePESymbols,
    parsePEImports,
    parseELF,
    parseELFSections,
    parseELFSymbols,
    parseELFImports,
    parseMachO,
    parseVideo,
    parsePDF,
    parseOfficeXML,
    parseAudio,
    parseFont,
    parseSQLite
};
