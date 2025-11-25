const { useState, useCallback } = React;

const {
    readFileAsArrayBuffer,
    getMagicBytes,
    calculateHashes,
    calculateEntropy,
    identifyFileType,
    formatBytes,
    extractStrings
} = window.Helpers;

const {
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
} = window.Parsers;

const {
    Header,
    DropZone,
    InfoCard,
    MetadataSection,
    SymbolsSection,
    ImportsSection,
    SectionsSection,
    ArchiveSection,
    HexSection,
    StringsSection,
    MapViewer
} = window.Components;

const App = () => {
    const [results, setResults] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const processFile = useCallback(async (selectedFile) => {
        if (!selectedFile) return;
        setResults(null);
        setIsAnalyzing(true);

        try {
            const arrayBuffer = await readFileAsArrayBuffer(selectedFile);
            const view = new DataView(arrayBuffer);
            const uint8Array = new Uint8Array(arrayBuffer);

            const hashes = await calculateHashes(arrayBuffer);
            const entropy = calculateEntropy(uint8Array);
            const magicHex = getMagicBytes(view, 16);
            let detectedFormat = identifyFileType(view, magicHex) || "Unknown Binary";
            const hexDump = uint8Array.slice(0, 4096);
            const ext = selectedFile.name.split('.').pop().toLowerCase();
            const strings = extractStrings(uint8Array);

            let metadata = {};
            let imports = {};
            let archiveContents = [];
            let symbols = [];
            let sections = [];
            let gps = null;

            if (magicHex.startsWith("4D5A")) {
                const peData = parsePE(view);
                metadata = peData.metadata;
                if (peData.e_lfanew) {
                    imports = parsePEImports(view, peData.e_lfanew);
                    sections = parsePESections(view, peData.e_lfanew);
                    symbols = parsePESymbols(view, peData.e_lfanew);
                }
            } else if (magicHex.startsWith("7F454C46")) {
                metadata = parseELF(view);
                sections = parseELFSections(view);
                imports = parseELFImports(view);
                symbols = parseELFSymbols(view);
            } else if (["FEEDFACE", "CEFAEDFE", "FEEDFACF", "CFFAEDFE", "CAFEBABE"].some(m => magicHex.startsWith(m))) {
                const mach = parseMachO(view);
                metadata = mach.metadata;
                sections = mach.sections;
                symbols = mach.symbols || [];
            } else if (magicHex.startsWith('FFD8') || magicHex.startsWith('89504E47') || ['jpg', 'jpeg', 'png', 'heic', 'tiff'].includes(ext)) {
                try {
                    if (window.exifr) {
                        const ex = await window.exifr.parse(arrayBuffer, { tiff: true, xmp: true, icc: true, gps: true });
                        if (ex) {
                            for (const [k, v] of Object.entries(ex)) {
                                if (v instanceof Uint8Array || (typeof v === 'object' && !(v instanceof Date))) continue;
                                metadata[k] = v instanceof Date ? v.toLocaleString() : v;
                            }
                            if (ex.latitude && ex.longitude) gps = { lat: ex.latitude, lon: ex.longitude };
                        }
                    }
                } catch (e) { console.log("EXIF Warning", e); }
            } else if (magicHex.startsWith("504B0304")) {
                const zipInfo = await parseZipContents(selectedFile);
                archiveContents = zipInfo.files || [];
                const zipEncrypted = zipInfo.encrypted;

                const lowerEntries = archiveContents.map(f => f.name?.toLowerCase() || "");
                const looksDocx = lowerEntries.some(n => n.startsWith("word/") || n.includes("word/document.xml"));
                const looksXlsx = lowerEntries.some(n => n.startsWith("xl/") || n.includes("xl/workbook"));
                const looksPptx = lowerEntries.some(n => n.startsWith("ppt/") || n.includes("ppt/presentation"));
                const hasVba = lowerEntries.some(n => n.includes("vbaproject.bin"));

                const isOfficeZip = looksDocx || looksXlsx || looksPptx || ['docx', 'xlsx', 'pptx', 'docm', 'xlsm', 'pptm'].includes(ext);
                if (isOfficeZip) {
                    const officeMeta = await parseOfficeXML(selectedFile);
                    metadata = officeMeta;
                    if (hasVba) {
                        metadata["⚠️ MACROS DETECTED"] = metadata["⚠️ MACROS DETECTED"] || "YES (vbaProject.bin found)";
                    }
                    if (looksDocx || ext.startsWith("doc")) detectedFormat = hasVba ? "Office Word (DOCM)" : "Office Word (DOCX)";
                    else if (looksXlsx || ext.startsWith("xls")) detectedFormat = hasVba ? "Office Excel (XLSM)" : "Office Excel (XLSX)";
                    else if (looksPptx || ext.startsWith("ppt")) detectedFormat = hasVba ? "Office PowerPoint (PPTM)" : "Office PowerPoint (PPTX)";
                    else detectedFormat = "Office OpenXML";
                } else {
                    detectedFormat = "ZIP Archive";
                }

                if (zipEncrypted !== null) {
                    metadata = metadata || {};
                    metadata["ZIP Encryption"] = zipEncrypted ? "Encrypted entries detected" : "Not encrypted (per flags)";
                }
            } else if (magicHex.startsWith("1F8B") || ['gz', 'tgz'].includes(ext)) {
                const gzipInfo = parseGzip(selectedFile, arrayBuffer, ext);
                metadata = Object.assign(metadata || {}, gzipInfo.metadata || {});
                if (gzipInfo.files?.length) archiveContents = gzipInfo.files;
                detectedFormat = gzipInfo.files?.length ? "TAR.GZ Archive" : "GZIP Archive";
            } else {
                const tarMagic = getMagicBytes(view, 6, 257);
                const seemsTar = tarMagic.toLowerCase().startsWith("7573746172") || ext === 'tar';
                if (seemsTar) {
                    archiveContents = parseTarArchive(arrayBuffer).files;
                    detectedFormat = "TAR Archive";
                } else if (detectedFormat.includes("ISO") || ['mp4', 'mkv', 'avi', 'mov'].includes(ext) || magicHex.startsWith("1A45")) {
                    const videoMeta = await parseVideo(selectedFile, view, magicHex, detectedFormat);
                    metadata = videoMeta;
                } else if (magicHex.startsWith("25504446")) {
                    metadata = await parsePDF(arrayBuffer);
                }
            }

            setResults({
                name: selectedFile.name,
                file: selectedFile,
                size: formatBytes(selectedFile.size),
                rawSize: selectedFile.size,
                type: selectedFile.type,
                magic: magicHex,
                detectedFormat,
                hashes,
                entropy,
                hexDump,
                strings,
                metadata,
                symbols,
                sections,
                imports,
                archiveContents,
                gps
            });

        } catch (err) {
            console.error(err);
            alert("Error parsing file: " + err.message);
        } finally {
            setIsAnalyzing(false);
        }
    }, []);

    const handleDownloadStrings = useCallback(async () => {
        if (!results?.file) return;
        try {
            const buffer = await readFileAsArrayBuffer(results.file);
            const allStrings = extractStrings(new Uint8Array(buffer), 4, Infinity);
            const safeName = (results.name || 'strings').replace(/[^\w.-]+/g, '_') || 'strings';
            const blob = new Blob([allStrings.join('\n')], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${safeName}_strings.txt`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            alert("Error preparing strings download: " + err.message);
        }
    }, [results]);

    return (
        <React.Fragment>
            <Header />
            <div className="container mx-auto px-4 py-8 max-w-6xl">
                <DropZone onFileSelect={processFile} isAnalyzing={isAnalyzing} />

                {results && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <InfoCard data={results} />

                        <div className="space-y-6">
                            <MetadataSection title="Extracted Metadata" data={results.metadata} icon="FileText">
                                <MapViewer gps={results.gps} />
                            </MetadataSection>

                            <SectionsSection sections={results.sections} />
                            <SymbolsSection symbols={results.symbols} />
                            <ImportsSection imports={results.imports} />
                            <ArchiveSection files={results.archiveContents} />
                            <StringsSection strings={results.strings} fileName={results.name} onDownloadAll={handleDownloadStrings} />
                            <HexSection data={results.hexDump} totalSize={results.rawSize} />
                        </div>
                    </div>
                )}
            </div>
        </React.Fragment>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
