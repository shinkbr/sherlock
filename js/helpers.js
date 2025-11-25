(() => {
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
        } catch (e) {}
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

    async function calculateHashes(arrayBuffer) {
        let md5 = "Error";
        try {
            if (window.SparkMD5) {
                const spark = new window.SparkMD5.ArrayBuffer();
                spark.append(arrayBuffer);
                md5 = spark.end();
            }
        } catch (e) {}

        const sha1Buffer = await crypto.subtle.digest('SHA-1', arrayBuffer);
        const sha1 = bufferToHex(sha1Buffer);
        const sha256Buffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const sha256 = bufferToHex(sha256Buffer);

        const crc = crc32(arrayBuffer).toString(16).toUpperCase().padStart(8, '0');

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

    function identifyFileType(view, hex) {
        const signatures = window.FILE_SIGNATURES || [];
        for (const sig of signatures) {
            if (hex.startsWith(sig.sig)) return sig.type;
        }
        try {
            if (hex.length >= 24) {
                const ftyp = String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7));
                if (ftyp === 'ftyp') return `ISO Media / MP4`;
            }
        } catch (e) {}
        return null;
    }

    // Extract printable strings similar to UNIX `strings`
    function extractStrings(u8, minLen = 4, maxStrings = 800) {
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

    window.Helpers = {
        readFileAsArrayBuffer,
        getMagicBytes,
        crc32,
        calculateHashes,
        calculateEntropy,
        bufferToHex,
        formatBytes,
        identifyFileType,
        extractStrings
    };
})();
