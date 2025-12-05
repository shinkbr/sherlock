import SparkMD5 from 'spark-md5';
import { FILE_SIGNATURES } from './config.js';

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function getMagicBytes(view, len = 4, offset = 0) {
    let hex = '';
    try {
        for (let i = 0; i < len; i++) {
            const byte = view
                .getUint8(offset + i)
                .toString(16)
                .toUpperCase();
            hex += byte.length === 1 ? '0' + byte : byte;
        }
    } catch {
        /* ignore */
    }
    return hex;
}

function crc32(arrayBuffer) {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[i] = c;
    }
    const u8 = new Uint8Array(arrayBuffer);
    let crc = 0 ^ -1;
    for (let i = 0; i < u8.length; i++) crc = (crc >>> 8) ^ table[(crc ^ u8[i]) & 0xff];
    return (crc ^ -1) >>> 0;
}

async function calculateHashes(arrayBuffer) {
    let md5 = 'Error';
    try {
        md5 = SparkMD5.ArrayBuffer.hash(arrayBuffer);
    } catch (e) {
        console.error('MD5 calculation error', e);
    }

    const sha1Buffer = await crypto.subtle.digest('SHA-1', arrayBuffer);
    const sha1 = bufferToHex(sha1Buffer);
    const sha256Buffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const sha256 = bufferToHex(sha256Buffer);

    const crc = crc32(arrayBuffer).toString(16).padStart(8, '0');

    return { md5, sha1, sha256, crc32: crc };
}

function calculateEntropy(u8) {
    const frequencies = new Array(256).fill(0);
    for (let i = 0; i < u8.length; i++) frequencies[u8[i]]++;
    let entropy = 0;
    for (let i = 0; i < 256; i++) {
        if (frequencies[i] > 0) {
            const p = frequencies[i] / u8.length;
            entropy -= p * Math.log2(p);
        }
    }
    return { value: entropy, percentage: (entropy / 8) * 100 };
}

function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// Heuristic to decide if a buffer is mostly text (UTF-8-ish)
function isLikelyText(u8) {
    if (!u8 || !u8.length) return false;
    const sample = u8.subarray(0, Math.min(u8.length, 8192));
    let printable = 0;
    let controlish = 0;
    for (let i = 0; i < sample.length; i++) {
        const b = sample[i];
        if (b === 0) {
            controlish++;
            continue;
        }
        if ((b >= 7 && b <= 13) || (b >= 32 && b <= 126)) {
            printable++;
            continue;
        }
        if (b >= 0xc2 && b <= 0xf4) {
            printable++;
            continue;
        } // likely UTF-8 multi-byte lead
        controlish++;
    }
    const ratio = printable / sample.length;
    return ratio > 0.85 && controlish / sample.length < 0.2;
}

function identifyFileType(view, hex) {
    const signatures = FILE_SIGNATURES || [];
    for (const sig of signatures) {
        if (hex.startsWith(sig.sig)) {
            // Refine RIFF
            if (sig.sig === '52494646' && hex.length >= 24) {
                const type = String.fromCharCode(
                    view.getUint8(8),
                    view.getUint8(9),
                    view.getUint8(10),
                    view.getUint8(11)
                );
                if (type === 'WAVE') return 'WAV Audio';
                if (type === 'AVI ') return 'AVI Video';
                return `RIFF Container (${type.trim()})`;
            }
            return sig.type;
        }
    }
    try {
        if (hex.length >= 16) {
            const ftyp = String.fromCharCode(
                view.getUint8(4),
                view.getUint8(5),
                view.getUint8(6),
                view.getUint8(7)
            );
            if (ftyp === 'ftyp') return `ISO Media / MP4`;
        }
    } catch {
        /* ignore */
    }
    return null;
}

// Extract printable strings similar to UNIX `strings`
function extractStrings(u8, minLen = 4, maxStrings = 1000) {
    const strings = [];
    let current = '';

    const isPrintable = (b) =>
        (b >= 32 && b <= 126) || // visible ASCII
        b === 9 ||
        b === 10 ||
        b === 13; // tab / newline / carriage return

    for (let i = 0; i < u8.length; i++) {
        const b = u8[i];
        if (isPrintable(b)) {
            current += String.fromCharCode(b);
        } else {
            if (current.length >= minLen) {
                strings.push(current);
                if (strings.length >= maxStrings) break;
            }
            current = '';
        }
    }

    if (strings.length < maxStrings && current.length >= minLen) strings.push(current);
    return strings;
}

const Helpers = {
    readFileAsArrayBuffer,
    getMagicBytes,
    crc32,
    calculateHashes,
    calculateEntropy,
    bufferToHex,
    formatBytes,
    identifyFileType,
    isLikelyText,
    extractStrings
};

export {
    readFileAsArrayBuffer,
    getMagicBytes,
    crc32,
    calculateHashes,
    calculateEntropy,
    bufferToHex,
    formatBytes,
    identifyFileType,
    isLikelyText,
    extractStrings,
    Helpers
};
