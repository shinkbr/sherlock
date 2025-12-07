import { useState, useCallback } from 'react';
import {
    readFileAsArrayBuffer,
    calculateHashes,
    calculateEntropy,
    formatBytes,
    extractStrings
} from '../utils/helpers.js';
import { detectAndParse } from '../parsers/registry.js';

export const useFileAnalysis = () => {
    const [results, setResults] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState(null);

    const processFile = useCallback(async (selectedFile) => {
        if (!selectedFile) return;
        setResults(null);
        setError(null);
        setIsAnalyzing(true);

        try {
            const arrayBuffer = await readFileAsArrayBuffer(selectedFile);
            const uint8Array = new Uint8Array(arrayBuffer);

            const hashes = await calculateHashes(arrayBuffer);
            const entropy = calculateEntropy(uint8Array);
            const hexDump = uint8Array.slice(0, 4096);
            const strings = extractStrings(uint8Array);

            const parsedData = await detectAndParse(selectedFile, arrayBuffer);

            setResults({
                name: selectedFile.name,
                file: selectedFile,
                size: formatBytes(selectedFile.size),
                rawSize: selectedFile.size,
                type: selectedFile.type,
                magic: parsedData.magicHex,
                detectedFormat: parsedData.detectedFormat,
                hashes,
                entropy,
                hexDump,
                strings,
                metadata: parsedData.metadata,
                symbols: parsedData.symbols,
                sections: parsedData.sections,
                imports: parsedData.imports,
                archiveContents: parsedData.archiveContents,
                gps: parsedData.gps
            });
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setIsAnalyzing(false);
        }
    }, []);

    return { results, isAnalyzing, error, processFile };
};
