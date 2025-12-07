import { getMagicBytes, identifyFileType, isLikelyText } from '../utils/helpers.js';
import {
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
    parseSQLite,
    parseImage
} from './index.js';

const TEXT_EXT_LABELS = {
    txt: 'Plain Text',
    md: 'Markdown',
    markdown: 'Markdown',
    json: 'JSON',
    yaml: 'YAML',
    yml: 'YAML',
    xml: 'XML',
    html: 'HTML',
    htm: 'HTML',
    css: 'CSS',
    js: 'JavaScript',
    ts: 'TypeScript',
    c: 'C Source',
    h: 'C Header',
    cpp: 'C++ Source',
    hpp: 'C++ Header',
    go: 'Go Source',
    rs: 'Rust Source',
    py: 'Python Source',
    sh: 'Shell Script',
    bash: 'Shell Script',
    bat: 'Batch Script',
    ini: 'INI Config',
    cfg: 'Config',
    conf: 'Config',
    log: 'Log File',
    csv: 'CSV',
    tsv: 'TSV'
};

export async function detectAndParse(file, arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const uint8Array = new Uint8Array(arrayBuffer);
    const magicHex = getMagicBytes(view, 16);
    const ext = (file.name.split('.').pop() || '').toLowerCase();

    let detectedFormat = identifyFileType(view, magicHex) || 'Unknown Binary';
    let metadata = {};
    let imports = {};
    let archiveContents = [];
    let symbols = [];
    let sections = [];
    let gps = null;

    if (magicHex.startsWith('4D5A')) {
        const peData = parsePE(view);
        metadata = peData.metadata;
        if (peData.e_lfanew) {
            imports = parsePEImports(view, peData.e_lfanew);
            sections = parsePESections(view, peData.e_lfanew);
            symbols = parsePESymbols(view, peData.e_lfanew);
        }
    } else if (magicHex.startsWith('7F454C46')) {
        metadata = parseELF(view);
        sections = parseELFSections(view);
        imports = parseELFImports(view);
        symbols = parseELFSymbols(view);
    } else if (
        ['FEEDFACE', 'CEFAEDFE', 'FEEDFACF', 'CFFAEDFE', 'CAFEBABE'].some((m) =>
            magicHex.startsWith(m)
        )
    ) {
        const mach = parseMachO(view);
        metadata = mach.metadata;
        sections = mach.sections;
        symbols = mach.symbols || [];
    } else if (
        magicHex.startsWith('FFD8') ||
        magicHex.startsWith('89504E47') ||
        ['jpg', 'jpeg', 'png', 'heic', 'tiff'].includes(ext)
    ) {
        const imgResult = await parseImage(arrayBuffer);
        metadata = imgResult.metadata || {};
        gps = imgResult.gps;
    } else if (magicHex.startsWith('504B0304')) {
        const zipInfo = await parseZipContents(file);
        archiveContents = zipInfo.files || [];
        const zipEncrypted = zipInfo.encrypted;

        const lowerEntries = archiveContents.map((f) => f.name?.toLowerCase() || '');
        const looksDocx = lowerEntries.some(
            (n) => n.startsWith('word/') || n.includes('word/document.xml')
        );
        const looksXlsx = lowerEntries.some(
            (n) => n.startsWith('xl/') || n.includes('xl/workbook')
        );
        const looksPptx = lowerEntries.some(
            (n) => n.startsWith('ppt/') || n.includes('ppt/presentation')
        );
        const hasVba = lowerEntries.some((n) => n.includes('vbaproject.bin'));

        const isOfficeZip =
            looksDocx ||
            looksXlsx ||
            looksPptx ||
            ['docx', 'xlsx', 'pptx', 'docm', 'xlsm', 'pptm'].includes(ext);
        if (isOfficeZip) {
            const officeMeta = await parseOfficeXML(file);
            metadata = officeMeta;
            if (hasVba) {
                metadata['⚠️ MACROS DETECTED'] =
                    metadata['⚠️ MACROS DETECTED'] || 'YES (vbaProject.bin found)';
            }
            if (looksDocx || ext.startsWith('doc'))
                detectedFormat = hasVba ? 'Office Word (DOCM)' : 'Office Word (DOCX)';
            else if (looksXlsx || ext.startsWith('xls'))
                detectedFormat = hasVba ? 'Office Excel (XLSM)' : 'Office Excel (XLSX)';
            else if (looksPptx || ext.startsWith('ppt'))
                detectedFormat = hasVba ? 'Office PowerPoint (PPTM)' : 'Office PowerPoint (PPTX)';
            else detectedFormat = 'Office OpenXML';
        } else {
            detectedFormat = 'ZIP Archive';
        }

        if (zipEncrypted !== null) {
            metadata = metadata || {};
            metadata['ZIP Encryption'] = zipEncrypted
                ? 'Encrypted entries detected'
                : 'Not encrypted';
        }
    } else if (magicHex.startsWith('1F8B') || ['gz', 'tgz'].includes(ext)) {
        const gzipInfo = parseGzip(file, arrayBuffer, ext);
        metadata = Object.assign(metadata || {}, gzipInfo.metadata || {});
        if (gzipInfo.files?.length) archiveContents = gzipInfo.files;
        detectedFormat = gzipInfo.files?.length ? 'TAR.GZ Archive' : 'GZIP Archive';
    } else {
        const tarMagic = getMagicBytes(view, 6, 257);
        const seemsTar = tarMagic.toLowerCase().startsWith('7573746172') || ext === 'tar';
        if (seemsTar) {
            archiveContents = parseTarArchive(arrayBuffer).files;
            detectedFormat = 'TAR Archive';
        } else if (
            detectedFormat.includes('ISO') ||
            ['mp4', 'mkv', 'avi', 'mov'].includes(ext) ||
            magicHex.startsWith('1A45') ||
            detectedFormat.includes('AVI Video')
        ) {
            const videoMeta = await parseVideo(file, arrayBuffer, magicHex, detectedFormat);
            metadata = videoMeta.metadata || {};
            if (videoMeta.gps) gps = videoMeta.gps;
        } else if (magicHex.startsWith('25504446')) {
            metadata = await parsePDF(arrayBuffer);
        } else if (
            detectedFormat.includes('Audio') ||
            ['mp3', 'wav', 'flac', 'ogg'].includes(ext)
        ) {
            metadata = parseAudio(file, arrayBuffer, detectedFormat.toUpperCase());
        } else if (
            detectedFormat.includes('Font') ||
            ['ttf', 'otf', 'woff', 'woff2'].includes(ext)
        ) {
            metadata = parseFont(arrayBuffer);
        } else if (detectedFormat.includes('SQLite') || ext === 'sqlite' || ext === 'db') {
            metadata = parseSQLite(arrayBuffer);
        }
    }

    if ((!detectedFormat || detectedFormat === 'Unknown Binary') && isLikelyText(uint8Array)) {
        detectedFormat = TEXT_EXT_LABELS[ext] || (ext ? `${ext.toUpperCase()} Text` : 'Plain Text');
    }

    return {
        magicHex,
        detectedFormat,
        metadata,
        imports,
        archiveContents,
        symbols,
        sections,
        gps
    };
}
