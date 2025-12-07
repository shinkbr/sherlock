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

if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = class DOMMatrix {
        constructor() {
            this.a = 1;
            this.b = 0;
            this.c = 0;
            this.d = 1;
            this.e = 0;
            this.f = 0;
        }
        setMatrixValue(_str) { }
        translate(_tx, _ty) {
            return this;
        }
        scale(_sx, _sy, _ox, _oy) {
            return this;
        }
        rotate(_angle, _ox, _oy) {
            return this;
        }
        multiply(_other) {
            return this;
        }
    };
}
