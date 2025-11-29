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
            const byte = view.getUint8(offset + i).toString(16).toUpperCase();
            hex += (byte.length === 1 ? '0' + byte : byte);
        }
    } catch (e) { }
    return hex;
}

function crc32(arrayBuffer) {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c;
    }
    const u8 = new Uint8Array(arrayBuffer);
    let crc = 0 ^ (-1);
    for (let i = 0; i < u8.length; i++) crc = (crc >>> 8) ^ table[(crc ^ u8[i]) & 0xFF];
    return (crc ^ (-1)) >>> 0;
}

function md5ArrayBuffer(arrayBuffer) {
    const data = new Uint8Array(arrayBuffer);
    const len = data.length;
    const blocks = (((len + 8) >>> 6) + 1) << 4;
    const words = new Uint32Array(blocks);

    for (let i = 0; i < len; i++) {
        words[i >> 2] |= data[i] << ((i % 4) * 8);
    }
    words[len >> 2] |= 0x80 << ((len % 4) * 8);
    words[blocks - 2] = len << 3;

    let a = 0x67452301;
    let b = 0xefcdab89;
    let c = 0x98badcfe;
    let d = 0x10325476;

    const rotl = (x, n) => (x << n) | (x >>> (32 - n));
    const add = (x, y) => (x + y) >>> 0;
    const cmn = (q, a1, b1, x, s, t) => add(rotl(add(add(a1, q), add(x, t)), s), b1);
    const ff = (a1, b1, c1, d1, x, s, t) => cmn((b1 & c1) | (~b1 & d1), a1, b1, x, s, t);
    const gg = (a1, b1, c1, d1, x, s, t) => cmn((b1 & d1) | (c1 & ~d1), a1, b1, x, s, t);
    const hh = (a1, b1, c1, d1, x, s, t) => cmn(b1 ^ c1 ^ d1, a1, b1, x, s, t);
    const ii = (a1, b1, c1, d1, x, s, t) => cmn(c1 ^ (b1 | ~d1), a1, b1, x, s, t);

    for (let i = 0; i < words.length; i += 16) {
        const oa = a, ob = b, oc = c, od = d;

        a = ff(a, b, c, d, words[i + 0], 7, 0xd76aa478);
        d = ff(d, a, b, c, words[i + 1], 12, 0xe8c7b756);
        c = ff(c, d, a, b, words[i + 2], 17, 0x242070db);
        b = ff(b, c, d, a, words[i + 3], 22, 0xc1bdceee);
        a = ff(a, b, c, d, words[i + 4], 7, 0xf57c0faf);
        d = ff(d, a, b, c, words[i + 5], 12, 0x4787c62a);
        c = ff(c, d, a, b, words[i + 6], 17, 0xa8304613);
        b = ff(b, c, d, a, words[i + 7], 22, 0xfd469501);
        a = ff(a, b, c, d, words[i + 8], 7, 0x698098d8);
        d = ff(d, a, b, c, words[i + 9], 12, 0x8b44f7af);
        c = ff(c, d, a, b, words[i + 10], 17, 0xffff5bb1);
        b = ff(b, c, d, a, words[i + 11], 22, 0x895cd7be);
        a = ff(a, b, c, d, words[i + 12], 7, 0x6b901122);
        d = ff(d, a, b, c, words[i + 13], 12, 0xfd987193);
        c = ff(c, d, a, b, words[i + 14], 17, 0xa679438e);
        b = ff(b, c, d, a, words[i + 15], 22, 0x49b40821);

        a = gg(a, b, c, d, words[i + 1], 5, 0xf61e2562);
        d = gg(d, a, b, c, words[i + 6], 9, 0xc040b340);
        c = gg(c, d, a, b, words[i + 11], 14, 0x265e5a51);
        b = gg(b, c, d, a, words[i + 0], 20, 0xe9b6c7aa);
        a = gg(a, b, c, d, words[i + 5], 5, 0xd62f105d);
        d = gg(d, a, b, c, words[i + 10], 9, 0x02441453);
        c = gg(c, d, a, b, words[i + 15], 14, 0xd8a1e681);
        b = gg(b, c, d, a, words[i + 4], 20, 0xe7d3fbc8);
        a = gg(a, b, c, d, words[i + 9], 5, 0x21e1cde6);
        d = gg(d, a, b, c, words[i + 14], 9, 0xc33707d6);
        c = gg(c, d, a, b, words[i + 3], 14, 0xf4d50d87);
        b = gg(b, c, d, a, words[i + 8], 20, 0x455a14ed);
        a = gg(a, b, c, d, words[i + 13], 5, 0xa9e3e905);
        d = gg(d, a, b, c, words[i + 2], 9, 0xfcefa3f8);
        c = gg(c, d, a, b, words[i + 7], 14, 0x676f02d9);
        b = gg(b, c, d, a, words[i + 12], 20, 0x8d2a4c8a);

        a = hh(a, b, c, d, words[i + 5], 4, 0xfffa3942);
        d = hh(d, a, b, c, words[i + 8], 11, 0x8771f681);
        c = hh(c, d, a, b, words[i + 11], 16, 0x6d9d6122);
        b = hh(b, c, d, a, words[i + 14], 23, 0xfde5380c);
        a = hh(a, b, c, d, words[i + 1], 4, 0xa4beea44);
        d = hh(d, a, b, c, words[i + 4], 11, 0x4bdecfa9);
        c = hh(c, d, a, b, words[i + 7], 16, 0xf6bb4b60);
        b = hh(b, c, d, a, words[i + 10], 23, 0xbebfbc70);
        a = hh(a, b, c, d, words[i + 13], 4, 0x289b7ec6);
        d = hh(d, a, b, c, words[i + 0], 11, 0xeaa127fa);
        c = hh(c, d, a, b, words[i + 3], 16, 0xd4ef3085);
        b = hh(b, c, d, a, words[i + 6], 23, 0x04881d05);
        a = hh(a, b, c, d, words[i + 9], 4, 0xd9d4d039);
        d = hh(d, a, b, c, words[i + 12], 11, 0xe6db99e5);
        c = hh(c, d, a, b, words[i + 15], 16, 0x1fa27cf8);
        b = hh(b, c, d, a, words[i + 2], 23, 0xc4ac5665);

        a = ii(a, b, c, d, words[i + 0], 6, 0xf4292244);
        d = ii(d, a, b, c, words[i + 7], 10, 0x432aff97);
        c = ii(c, d, a, b, words[i + 14], 15, 0xab9423a7);
        b = ii(b, c, d, a, words[i + 5], 21, 0xfc93a039);
        a = ii(a, b, c, d, words[i + 12], 6, 0x655b59c3);
        d = ii(d, a, b, c, words[i + 3], 10, 0x8f0ccc92);
        c = ii(c, d, a, b, words[i + 10], 15, 0xffeff47d);
        b = ii(b, c, d, a, words[i + 1], 21, 0x85845dd1);
        a = ii(a, b, c, d, words[i + 8], 6, 0x6fa87e4f);
        d = ii(d, a, b, c, words[i + 15], 10, 0xfe2ce6e0);
        c = ii(c, d, a, b, words[i + 6], 15, 0xa3014314);
        b = ii(b, c, d, a, words[i + 13], 21, 0x4e0811a1);
        a = ii(a, b, c, d, words[i + 4], 6, 0xf7537e82);
        d = ii(d, a, b, c, words[i + 11], 10, 0xbd3af235);
        c = ii(c, d, a, b, words[i + 2], 15, 0x2ad7d2bb);
        b = ii(b, c, d, a, words[i + 9], 21, 0xeb86d391);

        a = add(a, oa);
        b = add(b, ob);
        c = add(c, oc);
        d = add(d, od);
    }

    const toHex = (x) => Array.from({ length: 4 }, (_, i) => ((x >>> (i * 8)) & 0xff).toString(16).padStart(2, '0')).join('');
    return [a, b, c, d].map(toHex).join('');
}

async function calculateHashes(arrayBuffer) {
    let md5 = "Error";
    try {
        md5 = md5ArrayBuffer(arrayBuffer);
    } catch (e) { }

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
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024; const dm = decimals < 0 ? 0 : decimals;
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
        if (b === 0) { controlish++; continue; }
        if ((b >= 7 && b <= 13) || (b >= 32 && b <= 126)) { printable++; continue; }
        if (b >= 0xC2 && b <= 0xF4) { printable++; continue; } // likely UTF-8 multi-byte lead
        controlish++;
    }
    const ratio = printable / sample.length;
    return ratio > 0.85 && controlish / sample.length < 0.2;
}

function identifyFileType(view, hex) {
    const signatures = FILE_SIGNATURES || [];
    for (const sig of signatures) {
        if (hex.startsWith(sig.sig)) return sig.type;
    }
    try {
        if (hex.length >= 16) {
            const ftyp = String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7));
            if (ftyp === 'ftyp') return `ISO Media / MP4`;
        }
    } catch (e) { }
    return null;
}

// Extract printable strings similar to UNIX `strings`
function extractStrings(u8, minLen = 4, maxStrings = 1000) {
    const strings = [];
    let current = "";

    const isPrintable = (b) => (
        (b >= 32 && b <= 126) || // visible ASCII
        b === 9 || b === 10 || b === 13 // tab / newline / carriage return
    );

    for (let i = 0; i < u8.length; i++) {
        const b = u8[i];
        if (isPrintable(b)) {
            current += String.fromCharCode(b);
        } else {
            if (current.length >= minLen) {
                strings.push(current);
                if (strings.length >= maxStrings) break;
            }
            current = "";
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

window.Helpers = Helpers;

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
