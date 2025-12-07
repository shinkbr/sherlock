import React, { useCallback } from 'react';
import { useFileAnalysis } from './hooks/useFileAnalysis.js';
import { readFileAsArrayBuffer, extractStrings } from './utils/helpers.js';

import {
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
} from './components/index.js';

const App = () => {
    const { results, isAnalyzing, error, processFile } = useFileAnalysis();

    React.useEffect(() => {
        if (error) {
            alert('Error parsing file: ' + error);
        }
    }, [error]);

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
            alert('Error preparing strings download: ' + err.message);
        }
    }, [results]);

    const handleDownloadHex = useCallback(async () => {
        if (!results?.file) return;
        try {
            const buffer = await readFileAsArrayBuffer(results.file);
            const u8 = new Uint8Array(buffer);
            let output = '';
            for (let i = 0; i < Math.ceil(u8.length / 16); i++) {
                const offset = (i * 16).toString(16).padStart(8, '0').toUpperCase();
                let hex = '',
                    ascii = '';
                for (let j = 0; j < 16; j++) {
                    const idx = i * 16 + j;
                    if (idx < u8.length) {
                        const byte = u8[idx];
                        hex += byte.toString(16).padStart(2, '0').toUpperCase() + ' ';
                        ascii += byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
                    } else {
                        hex += '   ';
                        ascii += ' '; // Original code had 3 spaces for hex padding and 1 for ascii? No, let's check.
                    }
                }
                output += `${offset}  ${hex} ${ascii}\n`;
            }
            // Check original code for padding logic, I might have missed consistency
            // Original:
            // else { hex += '   '; ascii += ' '; }

            const safeName = (results.name || 'hexdump').replace(/[^\w.-]+/g, '_') || 'hexdump';
            const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${safeName}_hexdump.txt`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            alert('Error preparing hex download: ' + err.message);
        }
    }, [results]);

    const hasMetadata =
        results &&
        ((results.metadata && Object.keys(results.metadata).length > 0) || !!results.gps);

    return (
        <React.Fragment>
            <Header />
            <div className="container mx-auto px-4 py-8 max-w-6xl">
                <DropZone onFileSelect={processFile} isAnalyzing={isAnalyzing} />

                {results && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <InfoCard data={results} />

                        <div className="space-y-6">
                            {hasMetadata && (
                                <MetadataSection
                                    title="Extracted Metadata"
                                    data={results.metadata}
                                    icon="FileText"
                                >
                                    <MapViewer gps={results.gps} />
                                </MetadataSection>
                            )}

                            <SectionsSection sections={results.sections} />
                            <SymbolsSection symbols={results.symbols} />
                            <ImportsSection imports={results.imports} />
                            <ArchiveSection files={results.archiveContents} />
                            <StringsSection
                                strings={results.strings}
                                fileName={results.name}
                                onDownloadAll={handleDownloadStrings}
                            />
                            <HexSection
                                data={results.hexDump}
                                totalSize={results.rawSize}
                                onDownloadAll={handleDownloadHex}
                            />
                        </div>
                    </div>
                )}
            </div>
        </React.Fragment>
    );
};

export default App;
