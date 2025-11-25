(() => {
    const { formatBytes } = window.Helpers;
    const decoder = new TextDecoder("utf-8");

    function parseTarArchive(bufferLike) {
        const u8 = bufferLike instanceof Uint8Array ? bufferLike : new Uint8Array(bufferLike);
        const files = [];
        let offset = 0;

        const readString = (start, length) => {
            const slice = u8.subarray(start, start + length);
            let end = 0;
            while (end < slice.length && slice[end] !== 0) end++;
            return decoder.decode(slice.subarray(0, end)).trim();
        };

        const parseOctal = (start, length) => {
            const str = readString(start, length).replace(/\0.*$/, '').trim();
            return str ? parseInt(str, 8) : 0;
        };

        while (offset + 512 <= u8.length) {
            const block = u8.subarray(offset, offset + 512);
            const isEmpty = block.every(b => b === 0);
            if (isEmpty) break; // end-of-archive marker

            const name = readString(offset, 100);
            const size = parseOctal(offset + 124, 12);
            const typeFlag = readString(offset + 156, 1);
            const isDir = typeFlag === '5' || name.endsWith('/');

            files.push({
                name: name || "(unnamed entry)",
                dir: isDir,
                size: formatBytes(size),
                crc: "N/A",
                encrypted: false
            });

            if (files.length > 200) break;

            const dataSection = Math.ceil(size / 512) * 512;
            offset += 512 + dataSection;
        }

        return { files };
    }

    function parseGzip(file, arrayBuffer, ext = "") {
        const u8 = new Uint8Array(arrayBuffer);
        const view = new DataView(arrayBuffer);
        if (u8.length < 10) return { metadata: { "GZIP Error": "File too small" }, files: [] };

        const flags = u8[3];
        let offset = 10;
        const osMap = {
            0: "FAT",
            1: "Amiga",
            2: "VMS",
            3: "Unix",
            4: "VMCMS",
            5: "Atari TOS",
            6: "HPFS",
            7: "Macintosh",
            8: "Z-System",
            9: "CP/M",
            10: "TOPS-20",
            11: "NTFS",
            12: "QDOS",
            13: "Acorn RISCOS",
            255: "Unknown"
        };

        if (flags & 0x04) {
            const xlen = view.getUint16(offset, true);
            offset += 2 + xlen;
        }

        const readNullTerminated = () => {
            let end = offset;
            while (end < u8.length && u8[end] !== 0) end++;
            const str = decoder.decode(u8.subarray(offset, end));
            offset = end + 1;
            return str;
        };

        let originalName = null, comment = null;
        if (flags & 0x08) originalName = readNullTerminated();
        if (flags & 0x10) comment = readNullTerminated();
        if (flags & 0x02) offset += 2; // header CRC16

        const mtime = view.getUint32(4, true);
        const metadata = {
            "GZIP Method": u8[2] === 8 ? "Deflate" : `Unknown (${u8[2]})`,
            "GZIP OS": osMap[u8[9]] || `Unknown (${u8[9]})`,
            "GZIP Modified": mtime ? new Date(mtime * 1000).toLocaleString() : "Not set"
        };
        if (originalName) metadata["Original Name"] = originalName;
        if (comment) metadata["Comment"] = comment;

        let files = [];
        const looksLikeTar = () => {
            const name = (originalName || file?.name || "").toLowerCase();
            return name.endsWith(".tar.gz") || name.endsWith(".tgz") || originalName?.toLowerCase().endsWith(".tar") || ext === "tgz";
        };

        const shouldInspectTar = looksLikeTar();
        if (window.pako && shouldInspectTar) {
            try {
                const decompressed = window.pako.ungzip(u8);
                files = parseTarArchive(decompressed).files;
            } catch (e) {
                console.error("GZIP decompress error", e);
                metadata["GZIP Warning"] = "Failed to decompress payload";
            }
        } else if (!window.pako && shouldInspectTar) {
            metadata["GZIP Warning"] = "pako missing; cannot inspect tar payload";
        }

        return { metadata, files };
    }

    async function parseZipContents(file) {
        const fallbackResult = { files: [], encrypted: null };

        const parseCentralDirectory = async () => {
            try {
                const buffer = await file.arrayBuffer();
                const view = new DataView(buffer);
                const u8 = new Uint8Array(buffer);
                const maxComment = 65557; // per ZIP spec (64k + signature/fields)
                let eocdOffset = -1;

                for (let i = u8.length - 22; i >= Math.max(0, u8.length - maxComment); i--) {
                    if (view.getUint32(i, true) === 0x06054b50) { // End of central directory
                        eocdOffset = i;
                        break;
                    }
                }
                if (eocdOffset === -1) return fallbackResult;

                const totalEntries = view.getUint16(eocdOffset + 10, true);
                const centralOffset = view.getUint32(eocdOffset + 16, true);
                let offset = centralOffset;
                const decoder = new TextDecoder("utf-8");
                const files = [];
                let isEncrypted = null;

                for (let i = 0; i < totalEntries; i++) {
                    if (view.getUint32(offset, true) !== 0x02014b50) break; // Central directory file header signature
                    const flags = view.getUint16(offset + 8, true);
                    const enc = (flags & 0x1) !== 0;
                    const crcVal = view.getUint32(offset + 16, true);
                    const uncompSize = view.getUint32(offset + 24, true);
                    const nameLen = view.getUint16(offset + 28, true);
                    const extraLen = view.getUint16(offset + 30, true);
                    const commentLen = view.getUint16(offset + 32, true);

                    const nameBytes = u8.slice(offset + 46, offset + 46 + nameLen);
                    const name = decoder.decode(nameBytes);
                    const dir = name.endsWith('/');

                    files.push({
                        name,
                        dir,
                        size: formatBytes(uncompSize),
                        crc: crcVal.toString(16).toUpperCase().padStart(8, '0'),
                        encrypted: enc
                    });

                    if (files.length > 200) break;
                    if (enc) isEncrypted = true;
                    offset += 46 + nameLen + extraLen + commentLen;
                }

                if (isEncrypted === null) isEncrypted = false;
                return { files, encrypted: isEncrypted };
            } catch (e) {
                console.error("ZIP central directory parse failed", e);
                return fallbackResult;
            }
        };

        // Use central directory parsing first so encrypted archives still list files.
        const central = await parseCentralDirectory();
        if (central.files.length > 0) return central;

        // Fallback to JSZip if central directory parsing fails (e.g., malformed).
        try {
            const zip = await window.JSZip.loadAsync(file);
            const files = [];
            let count = 0;
            let isEncrypted = null;
            zip.forEach((relativePath, zipEntry) => {
                if (count > 200) return;
                let crc = "N/A";
                if (zipEntry._data && typeof zipEntry._data.crc32 === 'number') crc = (zipEntry._data.crc32 >>> 0).toString(16).toUpperCase().padStart(8, '0');
                if (zipEntry.encrypted === true) isEncrypted = true;
                files.push({ name: relativePath, dir: zipEntry.dir, size: formatBytes(zipEntry._data.uncompressedSize), crc, encrypted: zipEntry.encrypted === true });
                count++;
            });
            if (isEncrypted === null) isEncrypted = false;
            return { files, encrypted: isEncrypted };
        } catch (e) {
            console.error("ZIP parse error", e);
            return fallbackResult;
        }
    }

    async function parseOfficeXML(file) {
        let props = {};
        try {
            const zip = await window.JSZip.loadAsync(file);
            const parser = new DOMParser();

            const hasMacros = zip.file("word/vbaProject.bin") || zip.file("xl/vbaProject.bin") || zip.file("ppt/vbaProject.bin");
            if (hasMacros) props["⚠️ MACROS DETECTED"] = "YES (vbaProject.bin found)";

            const appFile = zip.file("docProps/app.xml");
            if (appFile) {
                const appText = await appFile.async("string");
                const appDoc = parser.parseFromString(appText, "text/xml");
                props["Company"] = appDoc.getElementsByTagName("Company")[0]?.textContent;
                props["Manager"] = appDoc.getElementsByTagName("Manager")[0]?.textContent;
                props["Application"] = appDoc.getElementsByTagName("Application")[0]?.textContent;
                props["App Version"] = appDoc.getElementsByTagName("AppVersion")[0]?.textContent;
            }

            const coreFile = zip.file("docProps/core.xml");
            if (coreFile) {
                const xmlText = await coreFile.async("string");
                const xmlDoc = parser.parseFromString(xmlText, "text/xml");
                props["Creator"] = xmlDoc.getElementsByTagName("dc:creator")[0]?.textContent;
                props["Last Modified By"] = xmlDoc.getElementsByTagName("cp:lastModifiedBy")[0]?.textContent;
                props["Created"] = xmlDoc.getElementsByTagName("dcterms:created")[0]?.textContent;
                props["Modified"] = xmlDoc.getElementsByTagName("dcterms:modified")[0]?.textContent;
                props["Subject"] = xmlDoc.getElementsByTagName("dc:subject")[0]?.textContent;
                props["Title"] = xmlDoc.getElementsByTagName("dc:title")[0]?.textContent;
                props["Keywords"] = xmlDoc.getElementsByTagName("cp:keywords")[0]?.textContent;
            }

            const workbook = zip.file("xl/workbook.xml");
            if (workbook) {
                const xmlText = await workbook.async("string");
                const xmlDoc = parser.parseFromString(xmlText, "text/xml");
                const sheets = xmlDoc.getElementsByTagName("sheet");
                let hiddenSheets = [];
                for (let i = 0; i < sheets.length; i++) {
                    const state = sheets[i].getAttribute("state");
                    if (state === "hidden" || state === "veryHidden") {
                        hiddenSheets.push(`${sheets[i].getAttribute("name")} (${state})`);
                    }
                }
                if (hiddenSheets.length > 0) props["⚠️ Hidden Sheets"] = hiddenSheets.join(", ");
            }

            let commentFiles = Object.keys(zip.files).filter(path => path.includes("comments") && path.endsWith(".xml"));
            if (commentFiles.length > 0) {
                let totalComments = 0;
                let authors = new Set();
                for (const path of commentFiles) {
                    const xmlText = await zip.file(path).async("string");
                    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
                    const comments = xmlDoc.getElementsByTagName("w:comment").length || xmlDoc.getElementsByTagName("comment").length;
                    totalComments += comments;

                    const authorTags = xmlDoc.getElementsByTagName("w:author");
                    for (let i = 0; i < authorTags.length; i++) authors.add(authorTags[i].textContent);
                }
                if (totalComments > 0) {
                    props["Comments Count"] = totalComments;
                    if (authors.size > 0) props["Comment Authors"] = Array.from(authors).join(", ");
                }
            }

        } catch (e) { console.error("Office Parse Error", e); }
        return props;
    }

    window.Parsers = Object.assign(window.Parsers || {}, {
        parseZipContents,
        parseOfficeXML,
        parseTarArchive,
        parseGzip
    });
})();
