(() => {
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

        const ensureText = () => {
            if (textCache) return textCache;
            textCache = new TextDecoder().decode(arrayBuffer);
            return textCache;
        };

        const setIfValue = (label, value) => {
            if (value === undefined || value === null || value === "") return;
            if (!metadata[label]) metadata[label] = value;
        };

        // Prefer pdf.js for structured metadata + annotation counts.
        if (window.pdfjsLib) {
            try {
                if (!window.__sherlockPdfWorkerConfigured) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js";
                    window.__sherlockPdfWorkerConfigured = true;
                }

                let passwordReason = null;
                const loadingTask = window.pdfjsLib.getDocument({
                    data: arrayBuffer,
                    disableFontFace: true,
                    onPassword: (callback, reason) => {
                        passwordReason = reason;
                        callback(null);
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
                    const resp = window.pdfjsLib.PasswordResponses;
                    if (passwordReason === resp?.NEED_PASSWORD) metadata["Encryption"] = "Password required";
                    else if (passwordReason === resp?.INCORRECT_PASSWORD) metadata["Encryption"] = "Encrypted (incorrect password)";
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
                } catch (e) {}

                doc.cleanup();
            } catch (e) {
                setIfValue("PDF Parse Note", e.message);
            }
        }

        // Fallback lightweight parsing when pdf.js isn't available or missed fields.
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
            metadata["Encryption"] = text.includes("/Encrypt") ? "Encrypted (Encrypt dictionary present)" : "Not detected";
        }

        if (!metadata["Comments/Annotations"] && /\/Annots\s*\[/.test(text)) {
            metadata["Comments/Annotations"] = "Annotation objects detected (not fully counted)";
        }

        return metadata;
    }

    window.Parsers = Object.assign(window.Parsers || {}, {
        parsePDF
    });
})();
