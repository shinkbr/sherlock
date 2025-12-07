function readString(view, offset, length) {
    let str = '';
    for (let i = 0; i < length; i++) {
        if (offset + i >= view.byteLength) break;
        str += String.fromCharCode(view.getUint8(offset + i));
    }
    return str;
}

function readStringUTF16BE(view, offset, length) {
    let str = '';
    for (let i = 0; i < length; i += 2) {
        if (offset + i + 1 >= view.byteLength) break;
        const charCode = view.getUint16(offset + i, false);
        if (charCode !== 0) str += String.fromCharCode(charCode);
    }
    return str;
}

function parseFont(buffer) {
    const view = new DataView(buffer);
    const meta = {};
    const sfntVersion = view.getUint32(0, false);

    // Check for TTF/OTF signature (0x00010000 or 'OTTO')
    if (sfntVersion === 0x00010000 || sfntVersion === 0x4f54544f) {
        meta['Format'] = sfntVersion === 0x00010000 ? 'TrueType (TTF)' : 'OpenType (OTF)';
        const numTables = view.getUint16(4, false);

        let nameTableOffset = 0;

        for (let i = 0; i < numTables; i++) {
            const offset = 12 + i * 16;
            const tag = readString(view, offset, 4);
            const tableOffset = view.getUint32(offset + 8, false);

            if (tag === 'name') {
                nameTableOffset = tableOffset;
                break;
            }
        }

        if (nameTableOffset) {
            try {
                const count = view.getUint16(nameTableOffset + 2, false);
                const stringOffset = view.getUint16(nameTableOffset + 4, false) + nameTableOffset;

                for (let i = 0; i < count; i++) {
                    const recordOff = nameTableOffset + 6 + i * 12;
                    const platformID = view.getUint16(recordOff, false);
                    const encodingID = view.getUint16(recordOff + 2, false);

                    const nameID = view.getUint16(recordOff + 6, false);
                    const length = view.getUint16(recordOff + 8, false);
                    const offset = view.getUint16(recordOff + 10, false);

                    const absOffset = stringOffset + offset;

                    // Prefer Windows (3) + Unicode BMP (1) or English (1033) generally,
                    // or Macintosh (1) Roman (0)

                    let val = '';
                    if (platformID === 3 && (encodingID === 1 || encodingID === 10)) {
                        val = readStringUTF16BE(view, absOffset, length);
                    } else if (platformID === 1 && encodingID === 0) {
                        val = readString(view, absOffset, length);
                    }

                    if (val) {
                        if (nameID === 1 && !meta['Font Family']) meta['Font Family'] = val;
                        if (nameID === 2 && !meta['Subfamily']) meta['Subfamily'] = val;
                        if (nameID === 4 && !meta['Full Name']) meta['Full Name'] = val;
                        if (nameID === 5 && !meta['Version']) meta['Version'] = val;
                        if (nameID === 0 && !meta['Copyright']) meta['Copyright'] = val;
                    }
                }
            } catch (e) {
                console.error('Font Name Table Parse Error', e);
            }
        }
    } else if (readString(view, 0, 4) === 'wOFF') {
        meta['Format'] = 'Web Open Font Format (WOFF)';
        meta['Flavor'] = readString(view, 4, 4) === 'OTTO' ? 'OpenType' : 'TrueType';
        meta['Length'] = view.getUint32(8, false);
        meta['Record Count'] = view.getUint16(12, false);

        const major = view.getUint16(24, false);
        const minor = view.getUint16(26, false);
        meta['Version'] = `${major}.${minor}`;
    } else if (readString(view, 0, 4) === 'wOF2') {
        meta['Format'] = 'Web Open Font Format 2.0 (WOFF2)';
        meta['Flavor'] = readString(view, 4, 4) === 'OTTO' ? 'OpenType' : 'TrueType';
        meta['Length'] = view.getUint32(8, false);
    }

    return meta;
}

export { parseFont };
