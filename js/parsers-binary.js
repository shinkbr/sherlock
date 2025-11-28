import { formatBytes } from './helpers.js';

    function parsePE(view) {
        try {
            const e_lfanew = view.getUint32(0x3C, true);
            if (view.getUint32(e_lfanew, true) !== 0x4550) return { metadata: {}, e_lfanew: 0 };
            const machine = view.getUint16(e_lfanew + 4, true);
            const time = new Date(view.getUint32(e_lfanew + 8, true) * 1000).toUTCString();
            return { metadata: { "Machine": machine.toString(16), "Compiled": time }, e_lfanew };
        } catch (e) { return { metadata: {}, e_lfanew: 0 }; }
    }

    function parsePESections(view, e_lfanew) {
        if (!e_lfanew) return [];
        try {
            const numSec = view.getUint16(e_lfanew + 6, true);
            const sizeOpt = view.getUint16(e_lfanew + 20, true);
            const secTable = e_lfanew + 24 + sizeOpt;
            const sections = [];

            const nameFromBytes = (offset) => {
                let name = "";
                for (let i = 0; i < 8; i++) {
                    const c = view.getUint8(offset + i);
                    if (c === 0) break;
                    name += String.fromCharCode(c);
                }
                return name || "SECTION_" + offset;
            };

            const typeFromCharacteristics = (ch) => {
                if (ch & 0x00000020) return "CODE";
                if (ch & 0x00000040) return "DATA";
                if (ch & 0x00000080) return "BSS";
                return "SECTION";
            };

            const flagsFromCharacteristics = (ch) => {
                const flags = [];
                if (ch & 0x20000000) flags.push("X");
                if (ch & 0x40000000) flags.push("R");
                if (ch & 0x80000000) flags.push("W");
                return flags.join("") || "-";
            };

            for (let i = 0; i < numSec; i++) {
                const off = secTable + (i * 40);
                const name = nameFromBytes(off);
                const virtualSize = view.getUint32(off + 8, true);
                const virtualAddress = view.getUint32(off + 12, true);
                const rawSize = view.getUint32(off + 16, true);
                const rawPtr = view.getUint32(off + 20, true);
                const characteristics = view.getUint32(off + 36, true);

                sections.push({
                    name,
                    type: typeFromCharacteristics(characteristics),
                    address: virtualAddress,
                    offset: rawPtr,
                    size: rawSize || virtualSize,
                    flags: flagsFromCharacteristics(characteristics)
                });
                if (sections.length >= 200) break;
            }
            return sections;
        } catch (e) {
            console.error("PE Sections Parse Error", e);
            return [];
        }
    }

    function parsePESymbols(view, e_lfanew) {
        if (!e_lfanew) return [];
        try {
            const optHeader = e_lfanew + 24;
            const is64 = view.getUint16(optHeader, true) === 0x20B;
            const numDirs = view.getUint32(optHeader + (is64 ? 108 : 92), true);

            const dataDir = optHeader + (is64 ? 112 : 96);
            const exportRVA = numDirs > 0 && dataDir + 40 <= view.byteLength ? view.getUint32(dataDir, true) : 0;
            const importRVA = numDirs > 1 && dataDir + 40 <= view.byteLength ? view.getUint32(dataDir + 8, true) : 0;

            const numSec = view.getUint16(e_lfanew + 6, true);
            const secTable = optHeader + view.getUint16(e_lfanew + 20, true);

            const rvaToOffset = (rva) => {
                for (let i = 0; i < numSec; i++) {
                    const sec = secTable + (i * 40);
                    const vAddr = view.getUint32(sec + 12, true);
                    let vSize = view.getUint32(sec + 8, true);
                    const rawSize = view.getUint32(sec + 16, true);
                    if (vSize === 0) vSize = rawSize;
                    const span = Math.max(vSize, rawSize);
                    const rawPtr = view.getUint32(sec + 20, true);
                    if (!rawPtr || span === 0) continue;
                    if (rva >= vAddr && rva < vAddr + span) return rva - vAddr + rawPtr;
                }
                return null;
            };

            const symbols = [];

            // Export table (for DLL exports)
            if (exportRVA) {
                const exportDir = rvaToOffset(exportRVA);
                if (exportDir) {
                    const ordinalBase = view.getUint32(exportDir + 16, true);
                    const numFuncs = view.getUint32(exportDir + 20, true);
                    const numNames = view.getUint32(exportDir + 24, true);
                    const funcTableRVA = view.getUint32(exportDir + 28, true);
                    const nameTableRVA = view.getUint32(exportDir + 32, true);
                    const ordTableRVA = view.getUint32(exportDir + 36, true);

                    const funcTableOff = rvaToOffset(funcTableRVA);
                    const nameTableOff = rvaToOffset(nameTableRVA);
                    const ordTableOff = rvaToOffset(ordTableRVA);

                    if (funcTableOff) {
                        const addSymbol = (name, funcIndex) => {
                            if (funcIndex < 0 || funcIndex >= numFuncs) return;
                            const funcRVA = view.getUint32(funcTableOff + funcIndex * 4, true);
                            let addr = "0x" + funcRVA.toString(16).toUpperCase();
                            // Forwarders reside inside export directory; treat as named pointer.
                            if (exportRVA && funcRVA >= exportRVA && funcRVA < exportRVA + 0x1000) {
                                const fwdOff = rvaToOffset(funcRVA);
                                if (fwdOff) {
                                    let s = "", k = fwdOff;
                                    while (k < view.byteLength) {
                                        const c = view.getUint8(k++);
                                        if (c === 0) break;
                                        s += String.fromCharCode(c);
                                        if (s.length > 200) break;
                                    }
                                    if (s) addr = `fwd:${s}`;
                                }
                            }
                            symbols.push({
                                name: name || `ord_${ordinalBase + funcIndex}`,
                                type: "EXPORT",
                                address: addr,
                                size: ""
                            });
                        };

                        if (numNames > 0 && nameTableOff && ordTableOff) {
                            const count = Math.min(numNames, 400);
                            for (let i = 0; i < count; i++) {
                                const nameRVA = view.getUint32(nameTableOff + i * 4, true);
                                const nameOff = rvaToOffset(nameRVA);
                                let name = "";
                                if (nameOff) {
                                    let c, idx = nameOff;
                                    while ((c = view.getUint8(idx++)) !== 0) name += String.fromCharCode(c);
                                }
                                const funcIndex = view.getUint16(ordTableOff + i * 2, true);
                                addSymbol(name, funcIndex);
                            }
                        } else {
                            const count = Math.min(numFuncs, 400);
                            for (let i = 0; i < count; i++) addSymbol("", i);
                        }
                    }
                }
            }

            // Fallback to COFF symbol table (object files or stripped exports)
            const symTablePtr = view.getUint32(e_lfanew + 8, true);
            const numSymbols = view.getUint32(e_lfanew + 12, true);
            if (symTablePtr && numSymbols && symTablePtr + numSymbols * 18 <= view.byteLength) {
                const stringTableOffset = symTablePtr + numSymbols * 18;
                const stringTableSize = view.getUint32(stringTableOffset, true);
                const maxSyms = Math.min(numSymbols, 400);

                const readName = (base) => {
                    const zero = view.getUint32(base, true);
                    if (zero === 0) {
                        const strOff = view.getUint32(base + 4, true);
                        const start = stringTableOffset + strOff;
                        if (stringTableSize && start < view.byteLength) {
                            let s = "", idx = start;
                            while (idx < view.byteLength) {
                                const c = view.getUint8(idx++);
                                if (c === 0) break;
                                s += String.fromCharCode(c);
                                if (s.length > 200) break;
                            }
                            return s;
                        }
                    } else {
                        let s = "";
                        for (let i = 0; i < 8; i++) {
                            const c = view.getUint8(base + i);
                            if (c === 0) break;
                            s += String.fromCharCode(c);
                        }
                        return s;
                    }
                    return "";
                };

                const storageMap = {
                    0: "END",
                    2: "EXTERNAL",
                    3: "STATIC",
                    103: "FUNCTION",
                    105: "FILE"
                };

                let i = 0;
                while (i < maxSyms) {
                    const base = symTablePtr + i * 18;
                    const name = readName(base) || `(sym ${i})`;
                    const value = view.getUint32(base + 8, true);
                    const type = view.getUint16(base + 14, true);
                    const storageClass = view.getUint8(base + 16);
                    const auxCount = view.getUint8(base + 17);

                    symbols.push({
                        name,
                        type: `COFF/${storageMap[storageClass] || storageClass}`,
                        address: "0x" + value.toString(16).toUpperCase(),
                        size: type
                    });
                    i += 1 + auxCount;
                }
            }

            // Imports as symbols (for typical EXEs with no exports)
            if (importRVA) {
                const importOffset = rvaToOffset(importRVA);
                if (importOffset) {
                    let descOffset = importOffset;
                    let safety = 0;
                    while (safety++ < 64) {
                        const descRVA = view.getUint32(descOffset, true);
                        const nameRVA = view.getUint32(descOffset + 12, true);
                        const thunkRVA = view.getUint32(descOffset + 16, true) || view.getUint32(descOffset + 0, true);
                        if (descRVA === 0 && nameRVA === 0 && thunkRVA === 0) break;

                        const dllNameOff = rvaToOffset(nameRVA);
                        let dllName = "";
                        if (dllNameOff) {
                            let c, idx = dllNameOff;
                            while ((c = view.getUint8(idx++)) !== 0) {
                                dllName += String.fromCharCode(c);
                                if (dllName.length > 200) break;
                            }
                        }

                        let thunkOff = rvaToOffset(thunkRVA);
                        let thunkSafety = 0;
                        while (thunkOff && thunkSafety++ < 512) {
                            const thunkData = is64 ? view.getBigUint64(thunkOff, true) : BigInt(view.getUint32(thunkOff, true));
                            if (thunkData === 0n) break;
                            const isOrdinal = (thunkData & (is64 ? 0x8000000000000000n : 0x80000000n)) !== 0n;
                            if (isOrdinal) {
                                const ord = Number(thunkData & 0xFFFFn);
                                symbols.push({
                                    name: `${dllName || "DLL"}!ord_${ord}`,
                                    type: "IMPORT",
                                    address: "IAT",
                                    size: ""
                                });
                            } else {
                                const hintNameRVA = Number(thunkData & (is64 ? 0x7FFFFFFFn : 0x7FFFFFFFn));
                                const hintOff = rvaToOffset(hintNameRVA);
                                if (hintOff) {
                                    const hintVal = view.getUint16(hintOff, true);
                                    let fn = "";
                                    let idx = hintOff + 2;
                                    let c;
                                    while (idx < view.byteLength && (c = view.getUint8(idx++)) !== 0) {
                                        fn += String.fromCharCode(c);
                                        if (fn.length > 200) break;
                                    }
                                    symbols.push({
                                        name: `${dllName || "DLL"}!${fn || "func"}`,
                                        type: "IMPORT",
                                        address: `IAT(hint:${hintVal})`,
                                        size: ""
                                    });
                                }
                            }
                            thunkOff += is64 ? 8 : 4;
                        }
                        descOffset += 20;
                    }
                }
            }

            return symbols;
        } catch (e) {
            console.error("PE Symbol Parse Error", e);
            return [];
        }
    }

    function parsePEImports(view, e_lfanew) {
        if (!e_lfanew) return {};
        try {
            const optHeader = e_lfanew + 24;
            const is64 = view.getUint16(optHeader, true) === 0x20B;
            const dataDir = optHeader + (is64 ? 112 : 96);
            const importRVA = view.getUint32(dataDir + 8, true);
            if (!importRVA) return {};

            const numSec = view.getUint16(e_lfanew + 6, true);
            const secTable = optHeader + view.getUint16(e_lfanew + 20, true);

            const rvaToOffset = (rva) => {
                for (let i = 0; i < numSec; i++) {
                    const sec = secTable + (i * 40);
                    const vAddr = view.getUint32(sec + 12, true);

                    let vSize = view.getUint32(sec + 8, true);
                    const rawSize = view.getUint32(sec + 16, true);
                    if (vSize === 0) vSize = rawSize;

                    const rawPtr = view.getUint32(sec + 20, true);
                    if (rva >= vAddr && rva < vAddr + vSize) return rva - vAddr + rawPtr;
                }
                return null;
            };

            let descOffset = rvaToOffset(importRVA);
            if (!descOffset) return {};

            const imports = {};
            let safety = 0;

            while (safety++ < 50) {
                if (view.getUint32(descOffset, true) === 0 && view.getUint32(descOffset + 12, true) === 0) break;

                const nameOffset = rvaToOffset(view.getUint32(descOffset + 12, true));
                let dll = "Unknown";

                if (nameOffset) {
                    dll = "";
                    let c, i = nameOffset;
                    while ((c = view.getUint8(i++)) !== 0) dll += String.fromCharCode(c);
                }

                const thunkRVA = view.getUint32(descOffset, true) || view.getUint32(descOffset + 16, true);
                let thunkOffset = rvaToOffset(thunkRVA);
                const funcs = [];

                if (thunkOffset) {
                    let fsafety = 0;
                    while (fsafety++ < 500) {
                        let rawVal = 0;
                        let isOrdinal = false;

                        if (is64) {
                            const low = view.getUint32(thunkOffset, true);
                            const high = view.getUint32(thunkOffset + 4, true);

                            if (low === 0 && high === 0) break;

                            if ((high & 0x80000000) !== 0) {
                                isOrdinal = true;
                                rawVal = low;
                            } else {
                                rawVal = low;
                            }
                        } else {
                            const val = view.getUint32(thunkOffset, true);
                            if (val === 0) break;

                            if ((val & 0x80000000) !== 0) {
                                isOrdinal = true;
                                rawVal = val & 0xFFFF;
                            } else {
                                rawVal = val & 0x7FFFFFFF;
                            }
                        }

                        if (isOrdinal) {
                            funcs.push(`Ordinal ${rawVal}`);
                        } else {
                            const nameOff = rvaToOffset(rawVal);
                            if (nameOff) {
                                let fn = "", k = nameOff + 2, c;
                                while ((c = view.getUint8(k++)) !== 0) fn += String.fromCharCode(c);
                                funcs.push(fn);
                            }
                        }
                        thunkOffset += (is64 ? 8 : 4);
                    }
                }
                if (funcs.length > 0) imports[dll] = funcs;
                descOffset += 20;
            }
            return imports;
        } catch (e) {
            console.error("PE Import Parse Error", e);
            return {};
        }
    }

    function parseELF(view) {
        try {
            const is64 = view.getUint8(4) === 2;
            const isLE = view.getUint8(5) === 1;
            const machine = view.getUint16(18, isLE);
            const map = { 0x03: "x86", 0x3E: "x64", 0x28: "ARM", 0xB7: "AArch64" };
            return { "Arch": map[machine] || machine.toString(16), "Class": is64 ? "64-bit" : "32-bit", "Endian": isLE ? "Little" : "Big" };
        } catch (e) { return {}; }
    }

    function parseELFSections(view) {
        try {
            const is64 = view.getUint8(4) === 2;
            const isLE = view.getUint8(5) === 1;

            const e_shoff = is64 ? Number(view.getBigUint64(40, isLE)) : view.getUint32(32, isLE);
            const e_shentsize = view.getUint16(is64 ? 58 : 46, isLE);
            const e_shnum = view.getUint16(is64 ? 60 : 48, isLE);
            const e_shstrndx = view.getUint16(is64 ? 62 : 50, isLE);

            if (!e_shoff || !e_shentsize || !e_shnum) return [];

            const readEntry = (idx) => e_shoff + (idx * e_shentsize);

            const shStrOff = readEntry(e_shstrndx);
            let strTab = null;
            if (view.getUint32(shStrOff, isLE) === 0x6FFFFFFF || view.getUint32(shStrOff, isLE) === 0) {
                // invalid or missing shstrtab
                strTab = new Uint8Array();
            } else {
                const shstrOffset = is64 ? Number(view.getBigUint64(shStrOff + 24, isLE)) : view.getUint32(shStrOff + 16, isLE);
                const shstrSize = is64 ? Number(view.getBigUint64(shStrOff + 32, isLE)) : view.getUint32(shStrOff + 20, isLE);
                strTab = new Uint8Array(view.buffer, shstrOffset, Math.min(shstrSize, view.byteLength - shstrOffset));
            }

            const getString = (offset) => {
                if (!strTab || offset >= strTab.length) return "";
                let s = "";
                for (let i = offset; i < strTab.length; i++) {
                    const c = strTab[i];
                    if (c === 0) break;
                    s += String.fromCharCode(c);
                }
                return s;
            };

            const typeMap = {
                0: "NULL",
                1: "PROGBITS",
                2: "SYMTAB",
                3: "STRTAB",
                4: "RELA",
                5: "HASH",
                6: "DYNAMIC",
                7: "NOTE",
                8: "NOBITS",
                9: "REL",
                10: "SHLIB",
                11: "DYNSYM",
                14: "INIT_ARRAY",
                15: "FINI_ARRAY",
                16: "PREINIT_ARRAY",
                17: "GROUP",
                18: "SYMTAB_SHNDX",
                19: "NUM",
                0x6ffffff6: "GNU_HASH",
                0x6ffffffe: "VERNEED",
                0x6fffffff: "VERSYM",
                0x6ffffff0: "GNU_ATTRIBUTES"
            };

            const flagsToLetters = (flags) => {
                const letters = [];
                if (flags & 0x1) letters.push("W");
                if (flags & 0x2) letters.push("A");
                if (flags & 0x4) letters.push("X");
                if (flags & 0x10) letters.push("M");
                if (flags & 0x20) letters.push("S");
                if (flags & 0x40) letters.push("I");
                if (flags & 0x80) letters.push("L");
                if (flags & 0x100) letters.push("O");
                if (flags & 0x200) letters.push("G");
                if (flags & 0x400) letters.push("T");
                if (flags & 0x800) letters.push("C");
                return letters.join("") || "-";
            };

            const sections = [];
            for (let i = 0; i < e_shnum; i++) {
                const off = readEntry(i);
                if (off + e_shentsize > view.byteLength) break;
                const nameOff = view.getUint32(off, isLE);
                const type = view.getUint32(off + 4, isLE);
                const flags = is64 ? Number(view.getBigUint64(off + 8, isLE)) : view.getUint32(off + 8, isLE);
                const addr = is64 ? Number(view.getBigUint64(off + 16, isLE)) : view.getUint32(off + 12, isLE);
                const shOffset = is64 ? Number(view.getBigUint64(off + 24, isLE)) : view.getUint32(off + 16, isLE);
                const shSize = is64 ? Number(view.getBigUint64(off + 32, isLE)) : view.getUint32(off + 20, isLE);

                sections.push({
                    name: getString(nameOff) || `SECTION_${i}`,
                    type: typeMap[type] || type.toString(16).toUpperCase(),
                    address: addr,
                    offset: shOffset,
                    size: shSize,
                    flags: flagsToLetters(flags)
                });
                if (sections.length >= 200) break;
            }
            return sections;
        } catch (e) {
            console.error("ELF Sections Parse Error", e);
            return [];
        }
    }

    function parseELFSymbols(view) {
        try {
            const is64 = view.getUint8(4) === 2;
            const isLE = view.getUint8(5) === 1;

            const e_shoff = is64 ? Number(view.getBigUint64(40, isLE)) : view.getUint32(32, isLE);
            const e_shentsize = view.getUint16(is64 ? 58 : 46, isLE);
            const e_shnum = view.getUint16(is64 ? 60 : 48, isLE);
            if (!e_shoff || !e_shentsize || !e_shnum) return [];

            const sections = [];
            for (let i = 0; i < e_shnum; i++) {
                const off = e_shoff + (i * e_shentsize);
                const type = view.getUint32(off + 4, isLE);
                const offset = is64 ? Number(view.getBigUint64(off + 24, isLE)) : view.getUint32(off + 16, isLE);
                const size = is64 ? Number(view.getBigUint64(off + 32, isLE)) : view.getUint32(off + 20, isLE);
                const link = view.getUint32(off + (is64 ? 40 : 24), isLE);
                const entsize = is64 ? Number(view.getBigUint64(off + 56, isLE)) : view.getUint32(off + 36, isLE);
                sections.push({ type, offset, size, link, entsize });
            }

            const getStrTable = (idx) => {
                const sec = sections[idx];
                if (!sec || !sec.size) return new Uint8Array();
                return new Uint8Array(view.buffer, sec.offset, Math.min(sec.size, view.byteLength - sec.offset));
            };

            const readStr = (table, off) => {
                if (!table || off >= table.length) return "";
                let s = "";
                for (let i = off; i < table.length; i++) {
                    const c = table[i];
                    if (c === 0) break;
                    s += String.fromCharCode(c);
                }
                return s;
            };

            const typeMap = { 0: "NOTYPE", 1: "OBJECT", 2: "FUNC", 3: "SECTION", 4: "FILE", 5: "COMMON", 6: "TLS" };
            const bindMap = { 0: "LOCAL", 1: "GLOBAL", 2: "WEAK" };
            const symbols = [];

            const parseSymSection = (secIdx) => {
                const sec = sections[secIdx];
                if (!sec || !sec.entsize || sec.entsize === 0) return;
                const strTab = getStrTable(sec.link);
                const count = Math.min(Math.floor(sec.size / sec.entsize), 400);
                for (let i = 0; i < count; i++) {
                    const base = sec.offset + i * sec.entsize;
                    const nameOff = view.getUint32(base, isLE);
                    let info, value, size;
                    if (is64) {
                        info = view.getUint8(base + 4);
                        value = Number(view.getBigUint64(base + 8, isLE));
                        size = Number(view.getBigUint64(base + 16, isLE));
                    } else {
                        info = view.getUint8(base + 12);
                        value = view.getUint32(base + 4, isLE);
                        size = view.getUint32(base + 8, isLE);
                    }
                    const type = info & 0xF;
                    const bind = info >> 4;
                    symbols.push({
                        name: readStr(strTab, nameOff) || `(sym ${i})`,
                        type: `${bindMap[bind] || bind}/${typeMap[type] || type}`,
                        address: "0x" + value.toString(16).toUpperCase(),
                        size
                    });
                }
            };

            sections.forEach((sec, idx) => {
                if (sec.type === 2 || sec.type === 11) parseSymSection(idx);
            });

            return symbols;
        } catch (e) {
            console.error("ELF Symbols Parse Error", e);
            return [];
        }
    }

    function parseELFImports(view) {
        try {
            const is64 = view.getUint8(4) === 2;
            const isLE = view.getUint8(5) === 1;

            const getString = (offset) => {
                let s = "";
                let i = offset;
                while (i < view.byteLength) {
                    const c = view.getUint8(i++);
                    if (c === 0) break;
                    s += String.fromCharCode(c);
                }
                return s;
            };

            const e_phoff = is64
                ? Number(view.getBigUint64(32, isLE))
                : view.getUint32(28, isLE);
            const e_phentsize = view.getUint16(is64 ? 54 : 42, isLE);
            const e_phnum = view.getUint16(is64 ? 56 : 44, isLE);

            const loadSegments = [];
            let dynamicSeg = null;

            for (let i = 0; i < e_phnum; i++) {
                const off = e_phoff + (i * e_phentsize);
                const type = view.getUint32(off, isLE);

                let pOffset = 0, pVaddr = 0, pFilesz = 0, pMemsz = 0;
                if (is64) {
                    pOffset = Number(view.getBigUint64(off + 8, isLE));
                    pVaddr = Number(view.getBigUint64(off + 16, isLE));
                    pFilesz = Number(view.getBigUint64(off + 32, isLE));
                    pMemsz = Number(view.getBigUint64(off + 40, isLE));
                } else {
                    pOffset = view.getUint32(off + 4, isLE);
                    pVaddr = view.getUint32(off + 8, isLE);
                    pFilesz = view.getUint32(off + 16, isLE);
                    pMemsz = view.getUint32(off + 20, isLE);
                }

                if (type === 1) loadSegments.push({ fileOff: pOffset, vaddr: pVaddr, memsz: pMemsz, filesz: pFilesz });
                if (type === 2) dynamicSeg = { fileOff: pOffset, size: pFilesz };
            }

            const addrToOffset = (addr) => {
                for (const seg of loadSegments) {
                    if (addr >= seg.vaddr && addr < seg.vaddr + seg.memsz) {
                        return seg.fileOff + (addr - seg.vaddr);
                    }
                }
                return 0;
            };

            const e_shoff = is64
                ? Number(view.getBigUint64(40, isLE))
                : view.getUint32(32, isLE);

            const e_shentsize = view.getUint16(is64 ? 58 : 46, isLE);
            const e_shnum = view.getUint16(is64 ? 60 : 48, isLE);
            const e_shstrndx = view.getUint16(is64 ? 62 : 50, isLE);

            let dynStrOff = 0;
            let dynSymOff = 0;
            let dynSymSize = 0;
            let dynamicOff = 0;
            let dynamicSize = 0;

            if (e_shoff && e_shnum && e_shstrndx !== 0) {
                const strTabHeaderOff = e_shoff + (e_shstrndx * e_shentsize);
                const strTabFileOff = is64
                    ? Number(view.getBigUint64(strTabHeaderOff + 24, isLE))
                    : view.getUint32(strTabHeaderOff + 16, isLE);

                const getShName = (idx) => {
                    const off = e_shoff + (idx * e_shentsize);
                    return view.getUint32(off, isLE);
                };

                for (let i = 0; i < e_shnum; i++) {
                    const nameOff = getShName(i);
                    const name = getString(strTabFileOff + nameOff);
                    const shOff = e_shoff + (i * e_shentsize);

                    const fileOff = is64
                        ? Number(view.getBigUint64(shOff + 24, isLE))
                        : view.getUint32(shOff + 16, isLE);

                    const size = is64
                        ? Number(view.getBigUint64(shOff + 32, isLE))
                        : view.getUint32(shOff + 20, isLE);

                    if (name === ".dynstr") dynStrOff = fileOff;
                    if (name === ".dynsym") { dynSymOff = fileOff; dynSymSize = size; }
                    if (name === ".dynamic") { dynamicOff = fileOff; dynamicSize = size; }
                }
            }

            if ((!dynamicOff || !dynamicSize) && dynamicSeg) {
                dynamicOff = dynamicSeg.fileOff;
                dynamicSize = dynamicSeg.size;
            }

            if (!dynamicOff || !dynamicSize) return {};

            const dependencies = [];
            const importedSyms = [];

            const dynEntSize = is64 ? 16 : 8;
            const dynSymEntDefault = is64 ? 24 : 16;
            let dynSymEntSize = dynSymEntDefault;
            let dynStrAddr = 0;
            let dynSymAddr = 0;
            let dynHashAddr = 0;
            let dynStrSize = 0;
            const neededOffsets = [];

            let offset = dynamicOff;
            let dynSafety = 0;
            while (offset + dynEntSize <= view.byteLength && offset < dynamicOff + dynamicSize && dynSafety < 2000) {
                const tag = is64
                    ? Number(view.getBigUint64(offset, isLE))
                    : view.getUint32(offset, isLE);

                const val = is64
                    ? Number(view.getBigUint64(offset + 8, isLE))
                    : view.getUint32(offset + 4, isLE);

                if (tag === 0) break; // DT_NULL
                if (tag === 1) neededOffsets.push(val); // DT_NEEDED
                if (tag === 5) dynStrAddr = val; // DT_STRTAB
                if (tag === 6) dynSymAddr = val; // DT_SYMTAB
                if (tag === 4) dynHashAddr = val; // DT_HASH
                if (tag === 10) dynStrSize = val; // DT_STRSZ
                if (tag === 11 && val) dynSymEntSize = val; // DT_SYMENT

                offset += dynEntSize;
                dynSafety++;
            }

            if (!dynStrOff && dynStrAddr) dynStrOff = addrToOffset(dynStrAddr);
            if (!dynSymOff && dynSymAddr) dynSymOff = addrToOffset(dynSymAddr);

            if (!dynSymSize && dynHashAddr) {
                const hashOff = addrToOffset(dynHashAddr);
                if (hashOff && hashOff + 8 <= view.byteLength) {
                    const nchain = view.getUint32(hashOff + 4, isLE);
                    dynSymSize = nchain * dynSymEntSize;
                }
            }

            const strTableReady = dynStrOff && dynStrOff < view.byteLength;
            if (strTableReady) {
                for (const relOff of neededOffsets) {
                    const dep = getString(dynStrOff + relOff);
                    if (dep) dependencies.push(dep);
                }
            }

            if (dynSymOff && dynSymOff < view.byteLength && strTableReady) {
                let symOffset = dynSymOff + dynSymEntSize; // skip null entry
                const symLimit = dynSymSize ? dynSymOff + dynSymSize : null;
                let safety = 0;
                while ((symLimit ? symOffset < symLimit : safety < 800) && symOffset + dynSymEntSize <= view.byteLength) {
                    let nameIdx, shndx, info;

                    if (is64) {
                        nameIdx = view.getUint32(symOffset, isLE);
                        info = view.getUint8(symOffset + 4);
                        shndx = view.getUint16(symOffset + 6, isLE);
                    } else {
                        nameIdx = view.getUint32(symOffset, isLE);
                        info = view.getUint8(symOffset + 12);
                        shndx = view.getUint16(symOffset + 14, isLE);
                    }

                    const binding = info >> 4;

                    if (shndx === 0 && nameIdx !== 0 && (binding === 1 || binding === 2)) {
                        const sym = getString(dynStrOff + nameIdx);
                        if (sym) importedSyms.push(sym);
                    }

                    symOffset += dynSymEntSize;
                    safety++;
                }
                if (!symLimit && safety >= 800) importedSyms.push("... (truncated)");
            }

            const result = {};
            if (dependencies.length > 0) result["Shared Libraries (DT_NEEDED)"] = dependencies;
            if (importedSyms.length > 0) result["Imported Functions (Undefined Symbols)"] = importedSyms;

            return result;
        } catch (e) {
            console.error("ELF Import Parse Error", e);
            return {};
        }
    }

    function parseMachO(view) {
        const cpuMap = {
            7: "x86",
            0x01000007: "x86_64",
            12: "ARM",
            0x0100000C: "ARM64",
            18: "PowerPC",
            0x01000012: "PowerPC64"
        };

        const fileTypeMap = {
            1: "Relocatable Object",
            2: "Executable",
            3: "Fixed VM Library",
            4: "Core",
            5: "Preloaded Executable",
            6: "Dynamic Library",
            7: "Dynamic Linker",
            8: "Bundle",
            9: "Dynamic Library Stub",
            10: "DSYM",
            11: "Kernel Extension"
        };

        const typeFlagMap = {
            0x0: "REGULAR",
            0x1: "ZEROFILL",
            0x2: "CSTRING_LITERALS",
            0x3: "4BYTE_LITERALS",
            0x4: "8BYTE_LITERALS",
            0x5: "LITERAL_POINTERS",
            0x6: "NON_LAZY_SYMBOL_POINTERS",
            0x7: "LAZY_SYMBOL_POINTERS",
            0x8: "SYMBOL_STUBS",
            0x9: "MOD_INIT_FUNC_POINTERS",
            0xA: "MOD_TERM_FUNC_POINTERS",
            0xB: "COALESCED",
            0xC: "GB_ZEROFILL",
            0xD: "INTERPOSING",
            0xE: "16BYTE_LITERALS",
            0xF: "DTRACE_DOF",
            0x10: "LAZY_DYLIB_SYMBOL_POINTERS",
            0x11: "THREAD_LOCAL_REGULAR",
            0x12: "THREAD_LOCAL_ZEROFILL",
            0x13: "THREAD_LOCAL_VARIABLES",
            0x14: "THREAD_LOCAL_VARIABLE_POINTERS",
            0x15: "THREAD_LOCAL_INIT_FUNCTION_POINTERS"
        };

        const protFlags = (prot) => {
            let flags = "";
            if (prot & 0x1) flags += "R";
            if (prot & 0x2) flags += "W";
            if (prot & 0x4) flags += "X";
            return flags || "-";
        };

        const readString = (start, len) => {
            let s = "";
            for (let i = 0; i < len; i++) {
                const c = view.getUint8(start + i);
                if (c === 0) break;
                s += String.fromCharCode(c);
            }
            return s;
        };

        const parseSingleMachO = (baseOffset, isLittle, magicVal) => {
            const is64 = magicVal === 0xFEEDFACF || magicVal === 0xCFFAEDFE;
            const rd32 = (off) => view.getUint32(off, isLittle);
            const rd64 = (off) => Number(view.getBigUint64(off, isLittle));

            const cputype = rd32(baseOffset + 4);
            const cpusubtype = rd32(baseOffset + 8);
            const filetype = rd32(baseOffset + 12);
            const ncmds = rd32(baseOffset + 16);
            const sizeofcmds = rd32(baseOffset + 20);
            const flags = rd32(baseOffset + 24);
            const headerSize = is64 ? 32 : 28;

            const metadata = {
                "Mach-O": is64 ? "64-bit" : "32-bit",
                "Arch": cpuMap[cputype] || `CPU ${cputype}`,
                "File Type": fileTypeMap[filetype] || filetype,
                "Load Commands": ncmds,
                "Size of Commands": formatBytes(sizeofcmds),
                "Header Flags": "0x" + flags.toString(16).toUpperCase()
            };
            if (cpusubtype) metadata["CPU Subtype"] = cpusubtype;

            const sections = [];
            let lcOffset = baseOffset + headerSize;
            let symtabInfo = null;

            for (let i = 0; i < ncmds; i++) {
                if (lcOffset + 8 > view.byteLength) break;
                const cmd = rd32(lcOffset);
                const cmdsize = rd32(lcOffset + 4);
                if (cmdsize <= 0) break;

                const LC_SEGMENT = 0x1;
                const LC_SEGMENT_64 = 0x19;
                const LC_SYMTAB = 0x2;

                const isSeg32 = cmd === LC_SEGMENT;
                const isSeg64 = cmd === LC_SEGMENT_64;
                if (isSeg32 || isSeg64) {
                    const segName = readString(lcOffset + 8, 16);
                    const vmaddr = isSeg64 ? rd64(lcOffset + 24) : rd32(lcOffset + 24);
                    const vmsize = isSeg64 ? rd64(lcOffset + 32) : rd32(lcOffset + 32);
                    const fileoff = isSeg64 ? rd64(lcOffset + 40) : rd32(lcOffset + 32 + 8);
                    const filesize = isSeg64 ? rd64(lcOffset + 48) : rd32(lcOffset + 40);
                    const initprot = rd32(lcOffset + (isSeg64 ? 60 : 44));
                    const nsects = rd32(lcOffset + (isSeg64 ? 64 : 48));

                    const sectHeaderSize = isSeg64 ? 80 : 68;
                    let sectOffset = lcOffset + (isSeg64 ? 72 : 56);

                    for (let s = 0; s < nsects; s++) {
                        if (sectOffset + sectHeaderSize > view.byteLength) break;
                        const sectname = readString(sectOffset, 16) || `SECTION_${s}`;
                        const flagsVal = rd32(sectOffset + (isSeg64 ? 64 : 56));
                        const sectionType = flagsVal & 0xFF;
                        const addr = isSeg64 ? rd64(sectOffset + 32) : rd32(sectOffset + 32);
                        const size = isSeg64 ? rd64(sectOffset + 40) : rd32(sectOffset + 36);
                        const offset = isSeg64 ? rd32(sectOffset + 48) : rd32(sectOffset + 40);

                        sections.push({
                            name: sectname,
                            type: typeFlagMap[sectionType] || sectionType.toString(16).toUpperCase(),
                            address: addr,
                            offset: offset,
                            size: size,
                            flags: protFlags(initprot)
                        });
                        if (sections.length >= 400) break;
                        sectOffset += sectHeaderSize;
                    }
                    // Add segment row if no sections
                    if (nsects === 0) {
                        sections.push({
                            name: segName || "SEGMENT",
                            type: "SEGMENT",
                            address: vmaddr,
                            offset: fileoff,
                            size: vmsize || filesize,
                            flags: protFlags(initprot)
                        });
                    }
                }
                if (cmd === LC_SYMTAB && cmdsize >= 24) {
                    symtabInfo = {
                        symoff: rd32(lcOffset + 8),
                        nsyms: rd32(lcOffset + 12),
                        stroff: rd32(lcOffset + 16),
                        strsize: rd32(lcOffset + 20)
                    };
                }

                lcOffset += cmdsize;
                if (lcOffset > view.byteLength) break;
            }

            const symbols = [];
            if (symtabInfo && symtabInfo.symoff + (is64 ? 16 : 12) <= view.byteLength) {
                const strTabEnd = Math.min(symtabInfo.stroff + symtabInfo.strsize, view.byteLength);
                const strTab = new Uint8Array(view.buffer, symtabInfo.stroff, Math.max(0, strTabEnd - symtabInfo.stroff));
                const readStrx = (off) => {
                    if (!strTab || off >= strTab.length) return "";
                    let s = "";
                    for (let i = off; i < strTab.length; i++) {
                        const c = strTab[i];
                        if (c === 0) break;
                        s += String.fromCharCode(c);
                    }
                    return s;
                };

                const typeMap = { 0x0: "UNDF", 0x2: "ABS", 0xE: "SECT", 0xC: "PBUD", 0xA: "INDR" };
                const maxSyms = Math.min(symtabInfo.nsyms, 400);
                for (let i = 0; i < maxSyms; i++) {
                    const base = symtabInfo.symoff + i * (is64 ? 16 : 12);
                    if (base + (is64 ? 16 : 12) > view.byteLength) break;
                    const strx = rd32(base);
                    const n_type = view.getUint8(base + 4);
                    const n_value = is64 ? Number(view.getBigUint64(base + 8, isLittle)) : view.getUint32(base + 8, isLittle);

                    if (n_type & 0xE0) continue; // STAB/debug entries
                    const baseType = n_type & 0x0E;
                    const ext = (n_type & 0x01) !== 0;

                    symbols.push({
                        name: readStrx(strx) || `(sym ${i})`,
                        type: `${ext ? "EXT" : "LOCAL"}/${typeMap[baseType] || baseType}`,
                        address: "0x" + n_value.toString(16).toUpperCase(),
                        size: ""
                    });
                }
            }

            return { metadata, sections, symbols };
        };

        const MAGIC = {
            MH_MAGIC: 0xFEEDFACE,
            MH_CIGAM: 0xCEFAEDFE,
            MH_MAGIC_64: 0xFEEDFACF,
            MH_CIGAM_64: 0xCFFAEDFE,
            FAT_MAGIC: 0xCAFEBABE,
            FAT_CIGAM: 0xBEBAFECA
        };

        const magicBE = view.getUint32(0, false);
        const magicLE = view.getUint32(0, true);

        const isFat = [magicBE, magicLE].some(m => m === MAGIC.FAT_MAGIC || m === MAGIC.FAT_CIGAM);
        if (isFat) {
            const fatLittle = magicBE === MAGIC.FAT_CIGAM || magicLE === MAGIC.FAT_CIGAM;
            const rd32 = (off) => view.getUint32(off, fatLittle);

            const nfat = rd32(4);
            const archNames = [];
            for (let i = 0; i < Math.min(nfat, 4); i++) {
                const off = 8 + i * 20;
                if (off + 20 > view.byteLength) break;
                const cputype = rd32(off);
                archNames.push(cpuMap[cputype] || `CPU ${cputype}`);
            }

            const firstArchOffset = rd32(16);
            if (!firstArchOffset || firstArchOffset >= view.byteLength) return { metadata: { "Mach-O": `Fat binary (${nfat} arch)` }, sections: [] };

            const innerMagicBE = view.getUint32(firstArchOffset, false);
            const innerMagicLE = view.getUint32(firstArchOffset, true);
            let innerLittle = false;
            let innerMagic = innerMagicBE;

            if (innerMagicBE === MAGIC.MH_MAGIC || innerMagicBE === MAGIC.MH_MAGIC_64) innerLittle = false;
            else if (innerMagicBE === MAGIC.MH_CIGAM || innerMagicBE === MAGIC.MH_CIGAM_64) innerLittle = true;
            else if (innerMagicLE === MAGIC.MH_MAGIC || innerMagicLE === MAGIC.MH_MAGIC_64) { innerLittle = true; innerMagic = innerMagicLE; }
            else if (innerMagicLE === MAGIC.MH_CIGAM || innerMagicLE === MAGIC.MH_CIGAM_64) { innerLittle = false; innerMagic = innerMagicLE; }

            const inner = parseSingleMachO(firstArchOffset, innerLittle, innerMagic);
            inner.metadata["Mach-O"] = `Fat binary (${nfat} arch)`;
            if (archNames.length) inner.metadata["Architectures"] = archNames.join(", ");
            return inner;
        }

        let isLittle = false;
        let magic = magicBE;
        if (magicBE === MAGIC.MH_MAGIC || magicBE === MAGIC.MH_MAGIC_64) {
            isLittle = false;
        } else if (magicBE === MAGIC.MH_CIGAM || magicBE === MAGIC.MH_CIGAM_64) {
            isLittle = true;
        } else if (magicLE === MAGIC.MH_MAGIC || magicLE === MAGIC.MH_MAGIC_64) {
            isLittle = true; magic = magicLE;
        } else if (magicLE === MAGIC.MH_CIGAM || magicLE === MAGIC.MH_CIGAM_64) {
            isLittle = false; magic = magicLE;
        }

        return parseSingleMachO(0, isLittle, magic);
    }

export {
    parsePE,
    parsePESections,
    parsePESymbols,
    parsePEImports,
    parseELF,
    parseELFSections,
    parseELFSymbols,
    parseELFImports,
    parseMachO
};
