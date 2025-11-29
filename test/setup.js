import { webcrypto } from 'node:crypto';

if (!globalThis.crypto || !globalThis.crypto.subtle) {
    globalThis.crypto = webcrypto;
}

if (typeof window !== 'undefined' && !window.crypto) {
    window.crypto = webcrypto;
}

if (typeof URL !== 'undefined' && !URL.createObjectURL) {
    URL.createObjectURL = () => 'blob:mock';
}
