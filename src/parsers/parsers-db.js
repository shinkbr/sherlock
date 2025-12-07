function readString(view, offset, length) {
    if (offset + length > view.byteLength) return '';
    let str = '';
    for (let i = 0; i < length; i++) {
        const c = view.getUint8(offset + i);
        if (c !== 0) str += String.fromCharCode(c);
    }
    return str;
}

function parseSQLite(buffer) {
    const view = new DataView(buffer);
    const meta = {};

    const header = readString(view, 0, 16);
    if (header.startsWith('SQLite format 3')) {
        meta['Format'] = 'SQLite Database (v3)';

        const pageSize = view.getUint16(16, false);
        meta['Page Size'] = pageSize === 1 ? 65536 : pageSize;

        const fileChangeCounter = view.getUint32(24, false);
        meta['File Change Counter'] = fileChangeCounter;

        const dbSizeInPages = view.getUint32(28, false);
        meta['Database Size (Pages)'] = dbSizeInPages;

        const userVersion = view.getUint32(60, false);
        meta['User Version'] = userVersion;

        const appID = view.getUint32(68, false);
        if (appID !== 0) meta['Application ID'] = appID;

        const versionValidFor = view.getUint32(92, false);
        meta['Version Valid For'] = versionValidFor;

        const sqliteVersion = view.getUint32(96, false);
        meta['SQLite Version Number'] = sqliteVersion;
    }

    return meta;
}

export { parseSQLite };
