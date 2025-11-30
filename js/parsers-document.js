function formatPDFDate(raw) {
    if (!raw) return null;
    try {
        const match = raw.match(/^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Z+-])?(\d{2})?'?(\d{2})'?/);
        if (!match) return raw;

        const [_, year, month = "01", day = "01", hour = "00", min = "00", sec = "00", tz = "Z", tzH = "00", tzM = "00"] = match;
        const iso = `${year}-${month}-${day}T${hour}:${min}:${sec}${tz === "Z" || !tz ? "Z" : `${tz}${tzH}:${tzM}`}`;
        const d = new Date(iso);
        if (isNaN(d.getTime())) return raw;
        return d.toLocaleString();
    } catch (e) {
        return raw;
    }
}

async function parsePDF(arrayBuffer) {
    const metadata = {};
    let textCache = null;
    let passwordReason = null;

    const ensureText = () => {
        if (textCache) return textCache;
        textCache = new TextDecoder().decode(arrayBuffer);
        return textCache;
    };

    const setIfValue = (label, value) => {
        if (value === undefined || value === null || value === "") return;
        if (!metadata[label]) metadata[label] = value;
    };

    // Always try to grab version from the header bytes, even if parsing fails later.
    const headerBytes = new Uint8Array(arrayBuffer, 0, Math.min(arrayBuffer.byteLength, 32));
    const headerText = new TextDecoder("ascii").decode(headerBytes);
    setIfValue("PDF Version", headerText.match(/%PDF-([0-9.]+)/)?.[1]);

    // Prefer pdf.js for structured metadata + annotation counts.
    try {
        const loadingTask = window.pdfjsLib.getDocument({
            data: arrayBuffer,
            disableFontFace: true,
            onPassword: (callback, reason) => {
                passwordReason = reason;
                callback("");
            }
        });

        const doc = await loadingTask.promise;
        const meta = await doc.getMetadata().catch(() => null);
        const info = meta?.info || doc?.pdfInfo || doc?._pdfInfo || {};

        setIfValue("PDF Version", info.PDFFormatVersion || info.version);
        setIfValue("Title", info.Title);
        setIfValue("Author", info.Author);
        setIfValue("Creator", info.Creator);
        setIfValue("Producer / Software", info.Producer);
        setIfValue("Subject", info.Subject);
        const keywords = Array.isArray(info.Keywords) ? info.Keywords.join(", ") : info.Keywords;
        setIfValue("Keywords", keywords);
        setIfValue("Created", formatPDFDate(info.CreationDate));
        setIfValue("Modified", formatPDFDate(info.ModDate));

        if (passwordReason !== null) {
            metadata["Encryption"] = "Encrypted";
        } else if (typeof doc.isEncrypted === "boolean") {
            metadata["Encryption"] = doc.isEncrypted ? "Encrypted" : "Not encrypted";
        }

        // Scan a few pages for annotations/comments to keep costs bounded.
        try {
            let annotationCount = 0;
            const pagesToScan = Math.min(doc.numPages || 0, 5);
            for (let i = 1; i <= pagesToScan; i++) {
                const page = await doc.getPage(i);
                const annots = await page.getAnnotations({ intent: "display" });
                annotationCount += (annots || []).length;
                if (annotationCount > 100) break;
            }
            if (annotationCount > 0) {
                const scope = pagesToScan === doc.numPages ? `all ${doc.numPages} pages` : `first ${pagesToScan} pages`;
                metadata["Comments/Annotations"] = `${annotationCount} found (${scope})`;
            }
        } catch (e) { }

        doc.cleanup();
    } catch (e) {
        if (e instanceof ReferenceError) throw e;
        const reason = passwordReason ?? e?.code ?? null;
        if (!metadata["Encryption"] && reason !== null) {
            metadata["Encryption"] = "Encrypted";
        }
    }

    // Fallback lightweight parsing to fill any gaps.
    const text = ensureText();
    if (!metadata["PDF Version"]) {
        const v = text.match(/%PDF-([0-9.]+)/)?.[1];
        if (v) metadata["PDF Version"] = v;
    }

    const author = text.match(/\/Author\s*\(([^()]*)\)/);
    const creator = text.match(/\/Creator\s*\(([^()]*)\)/);
    const producer = text.match(/\/Producer\s*\(([^()]*)\)/);
    const title = text.match(/\/Title\s*\(([^()]*)\)/);
    const subject = text.match(/\/Subject\s*\(([^()]*)\)/);
    const creationDate = text.match(/\/CreationDate\s*\(([^()]*)\)/);
    const modDate = text.match(/\/ModDate\s*\(([^()]*)\)/);

    setIfValue("Title", title?.[1]);
    setIfValue("Author", author?.[1]);
    setIfValue("Creator", creator?.[1]);
    setIfValue("Producer / Software", producer?.[1]);
    setIfValue("Subject", subject?.[1]);
    setIfValue("Created", formatPDFDate(creationDate?.[1]));
    setIfValue("Modified", formatPDFDate(modDate?.[1]));

    if (!metadata["Encryption"]) {
        metadata["Encryption"] = text.includes("/Encrypt") ? "Encrypted" : "Not encrypted";
    }

    if (!metadata["Comments/Annotations"] && /\/Annots\s*\[/.test(text)) {
        metadata["Comments/Annotations"] = "Annotation objects detected (not fully counted)";
    }

    return metadata;
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

export {
    formatPDFDate,
    parsePDF,
    parseOfficeXML
};
