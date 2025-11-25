# Sherlock File Forensics

Sherlock is a browser-based file forensics viewer. Drop a file into the page to quickly fingerprint it, preview key metadata, and inspect contents (hashes, imports, EXIF, archive listings, hex, and printable strings). Everything runs locally in the browser—no uploads.

## Features

- File detection: magic bytes + signature table to label common formats (PE/ELF, images, PDFs, ZIP/Office, video containers, gzip/rar/7z, etc.).
- Hashes: MD5, SHA-1, SHA-256, CRC32.
- Entropy: value + simple risk bar.
- Hex view: first 512 bytes.
- Strings: printable strings (min length 4, capped at 800).
- Imports:
  - PE: import table parsing (DLLs + functions, ordinal support).
  - ELF: DT_NEEDED shared libraries and undefined/imported symbols.
- Archives: ZIP listing (name, size, CRC), TAR/TAR.GZ/GZ inspection with basic metadata, with limits to avoid huge dumps.
- Office OpenXML (docx/xlsx/pptx): creator, last modified, created/modified timestamps, application info, hidden sheets, comments, macro detection (vbaProject.bin).
- Images: EXIF/XMP/ICC extraction via exifr; GPS mapped inline + link to Google Maps.
- Video: duration and resolution (via HTML5 video metadata).
- PDF: version detection.

## Supported File Types

| File category | File extensions | Information extracted in Sherlock |
| --- | --- | --- |
| All files | Any | Magic/format detection, hashes (SHA-256/SHA-1/MD5/CRC32), entropy, hex preview (first 512 bytes), printable strings (up to 800) |
| Executables | EXE, DLL, ELF, Mach-O | Machine type, compile timestamp, sections (addresses/flags), imports/exports, symbols |
| Documents | PDF | Version, title, author, creator, producer, subject, keywords, created/modified dates, encryption status, sampled annotation count |
| Office | DOCX, XLSX, PPTX | Creator/last modified by, created/modified timestamps, application info, hidden sheets, comment count/authors, macro detection |
| Images | JPEG, PNG, TIFF, HEIC, GIF, BMP, PSD, ICO | EXIF/XMP/ICC metadata, GPS coordinates |
| Media | MP4, MOV, MKV, AVI, WMV, ASF | Container detection plus video duration and resolution |
| Archives | ZIP, TAR, GZ, TGZ | ZIP central directory listing (name/size/CRC, encryption flag); TAR/TAR.GZ file listing; GZ header metadata (original name/OS/mtime); other archives detected with hashes/hex/strings |

## Usage

1) Open `index.html` in a modern browser.  
2) Drag-and-drop a file or click the drop zone to browse.  
3) Review the cards: hashes/entropy, metadata, imports, archive contents, hex, strings, and map (if GPS exists).

## Notes & Limits

- Parsing is intentionally shallow for speed and safety; very large files may be truncated (e.g., hex to 512 bytes, strings capped).  
- All processing is client-side; ensure required CDN scripts (React, exifr, JSZip, SparkMD5, pako) load when running offline.  
- No persistence or uploads are performed.***
