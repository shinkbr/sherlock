import { identifyFileType } from './helpers.js';
import {
    parseZipContents,
    parseTarArchive,
    parseGzip
} from './parsers-archive.js';
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
    parseOfficeXML
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
    parseOfficeXML
};

// window.Parsers = Parsers; // Removed for module usage
