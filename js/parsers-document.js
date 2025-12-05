import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';
import exifr from 'exifr';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

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
        const loadingTask = pdfjsLib.getDocument({
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

        // Scan all pages for annotations/comments (ignore ones without text).
        try {
            let annotationCount = 0;
            const pagesToScan = doc.numPages || 0;
            let pagesScanned = 0;
            const commentSnippets = [];
            const extractText = (val) => {
                if (val === undefined || val === null) return "";
                if (typeof val === "string") return val;
                if (Array.isArray(val)) {
                    return val.map(extractText).filter(Boolean).join(" ");
                }
                if (typeof val === "object") {
                    if (typeof val.str === "string") return val.str;
                    if (Array.isArray(val.items)) {
                        return val.items.map(it => extractText(it?.str ?? it)).filter(Boolean).join(" ");
                    }
                    if (typeof val.value === "string") return val.value;
                }
                return typeof val.toString === "function" ? val.toString() : "";
            };
            for (let i = 1; i <= pagesToScan; i++) {
                const page = await doc.getPage(i);
                const annots = await page.getAnnotations({ intent: "display" });
                const contents = (annots || []).flatMap(a => {
                    const candidates = [
                        a?.contents,
                        a?.content,
                        a?.contentsObj,
                        a?.richText,
                        a?.title,
                        a?.subject,
                        a?.text,
                        a?.altText,
                        a?.caption,
                        a?.popup?.contents,
                        a?.popup?.richText,
                        a?.irtContents,
                        a?.reviewState?.state,
                        a?.reviewState?.stateModel,
                        a?.data?.contents,
                        a?.data?.content,
                        a?.data?.contentsObj,
                        a?.data?.richText,
                        a?.data?.title,
                        a?.data?.subject
                    ];
                    const seen = new Set();
                    const extracted = candidates
                        .map(extractText)
                        .map(t => t.trim())
                        .filter(Boolean)
                        .filter(t => {
                            if (seen.has(t)) return false;
                            seen.add(t);
                            return true;
                        });
                    return extracted;
                });
                const hasText = contents.length > 0;
                if (hasText) annotationCount++;
                for (const text of contents) {
                    const snippet = text.length > 300 ? `${text.slice(0, 300)}…` : text;
                    commentSnippets.push(`p${i}: ${snippet}`);
                }
                pagesScanned++;
            }
            if (annotationCount > 0) {
                const scope = pagesScanned === pagesToScan ? `all ${pagesToScan} pages` : `first ${pagesScanned} pages`;
                metadata["Comments/Annotations"] = `${annotationCount} found (${scope})`;
                if (commentSnippets.length > 0) {
                    metadata["Annotation Comments"] = commentSnippets.join("\n");
                }
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

    return metadata;
}

async function parseOfficeXML(file) {
    let props = {};
    try {
        const zip = await JSZip.loadAsync(file);
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

        // --- Embedded File Analysis ---
        const mediaFiles = Object.keys(zip.files).filter(path =>
            !zip.files[path].dir && (
                path.startsWith("word/media/") ||
                path.startsWith("xl/media/") ||
                path.startsWith("ppt/media/")
            )
        );

        if (mediaFiles.length > 0) {
            props["Embedded Files"] = `${mediaFiles.length} found`;

            const exifDataToCheck = [];
            for (const path of mediaFiles) {
                // simple extension check
                if (/\.(jpe?g|png|tiff?|heic)$/i.test(path)) {
                    exifDataToCheck.push(path);
                }
            }

            if (exifDataToCheck.length > 0) {
                let analyzedCount = 0;
                const analysisResults = [];

                for (const path of exifDataToCheck) {
                    try {
                        const arrayBuffer = await zip.file(path).async("arraybuffer");
                        // Only looking for critical metadata to avoid clutter
                        const tags = await exifr.parse(arrayBuffer, {
                            tiff: true,
                            exif: true,
                            gps: true,
                            ifd0: true, // Make, Model often here
                            xmp: false,
                            icc: false,
                            mergeOutput: true
                        });

                        if (tags) {
                            const interesting = {};
                            if (tags.Make) interesting.Make = tags.Make;
                            if (tags.Model) interesting.Model = tags.Model;
                            if (tags.Software) interesting.Software = tags.Software;
                            if (tags.DateTimeOriginal) interesting.Date = tags.DateTimeOriginal;
                            if (tags.GPSLatitude && tags.GPSLongitude) {
                                interesting.GPS = `${tags.GPSLatitude}, ${tags.GPSLongitude}`;
                            }

                            if (Object.keys(interesting).length > 0) {
                                const details = Object.entries(interesting).map(([k, v]) => `${k}: ${v}`).join(", ");
                                analysisResults.push(`[${path.split('/').pop()}] ${details}`);
                                analyzedCount++;
                            }
                        }
                    } catch (e) {
                        // ignore corrupt images or unsupported formats silently
                    }
                }

                if (analysisResults.length > 0) {
                    props["Embedded EXIF"] = analysisResults.join("\n");
                }
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
