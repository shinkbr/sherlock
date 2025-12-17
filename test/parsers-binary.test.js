import {
    parseELF,
    parseELFImports,
    parseELFSections,
    parseELFSymbols,
    parseMachO,
    parsePE,
    parsePEImports,
    parsePESymbols,
    parsePESections
} from '../src/parsers/parsers-binary.js';

function setString(view, offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    view.setUint8(offset + str.length, 0);
}

function setU32(view, offset, value, littleEndian = true) {
    view.setUint32(offset, value >>> 0, littleEndian);
}

function setU16(view, offset, value, littleEndian = true) {
    view.setUint16(offset, value & 0xffff, littleEndian);
}

function buildPEView() {
    const buffer = new ArrayBuffer(4096);
    const view = new DataView(buffer);
    const e_lfanew = 0x80;

    view.setUint32(0x3c, e_lfanew, true);
    view.setUint32(e_lfanew, 0x4550, true); // "PE\0\0"
    view.setUint16(e_lfanew + 4, 0x14c, true);
    view.setUint16(e_lfanew + 6, 2, true); // two sections
    view.setUint32(e_lfanew + 8, 0x5e2d1b3a, true); // timestamp
    view.setUint16(e_lfanew + 20, 0xe0, true); // optional header size

    const optHeader = e_lfanew + 24;
    view.setUint16(optHeader, 0x10b, true); // PE32
    view.setUint32(optHeader + 92, 2, true); // number of data directories
    view.setUint32(optHeader + 96, 0x2000, true); // export RVA
    view.setUint32(optHeader + 104, 0x3000, true); // import RVA

    const secTable = optHeader + 0xe0;
    const writeSection = (offset, name, vaddr, rawPtr, charact) => {
        setString(view, offset, name);
        view.setUint32(offset + 8, 0x200, true); // virtual size
        view.setUint32(offset + 12, vaddr, true);
        view.setUint32(offset + 16, 0x200, true); // raw size
        view.setUint32(offset + 20, rawPtr, true);
        view.setUint32(offset + 36, charact, true);
    };

    writeSection(secTable, '.text', 0x2000, 0x400, 0x60000020);
    writeSection(secTable + 40, '.idata', 0x3000, 0xa00, 0xc0000040);

    // Export table
    const exportDir = 0x400;
    view.setUint32(exportDir + 16, 1, true); // ordinal base
    view.setUint32(exportDir + 20, 1, true); // num funcs
    view.setUint32(exportDir + 24, 1, true); // num names
    view.setUint32(exportDir + 28, 0x2100, true); // func table RVA
    view.setUint32(exportDir + 32, 0x2140, true); // name table RVA
    view.setUint32(exportDir + 36, 0x2180, true); // ord table RVA

    view.setUint32(0x500, 0x2000, true); // func table entry
    view.setUint32(0x540, 0x21c0, true); // name table entry
    view.setUint16(0x580, 0, true); // ordinal table entry
    setString(view, 0x5c0, 'exported');

    // Import table
    const impDesc = 0xa00;
    view.setUint32(impDesc + 12, 0x3050, true); // name RVA
    view.setUint32(impDesc + 16, 0x3060, true); // thunk RVA
    setString(view, 0xa50, 'KERNEL32.dll');
    view.setUint32(0xa60, 0x3080, true); // first thunk entry
    view.setUint16(0xa80, 1, true); // hint
    setString(view, 0xa82, 'CreateFile');

    return view;
}

function buildELFView() {
    const buffer = new ArrayBuffer(0x800);
    const view = new DataView(buffer);
    const u8 = new Uint8Array(buffer);
    u8.set([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00], 0);

    view.setUint16(18, 0x3e, true); // x86_64
    view.setBigUint64(32, 0x40n, true); // e_phoff
    view.setBigUint64(40, 0x300n, true); // e_shoff
    view.setUint16(54, 56, true); // e_phentsize
    view.setUint16(56, 2, true); // e_phnum
    view.setUint16(58, 64, true); // e_shentsize
    view.setUint16(60, 5, true); // e_shnum
    view.setUint16(62, 4, true); // e_shstrndx

    // Program headers
    view.setUint32(0x40, 1, true); // PT_LOAD
    view.setBigUint64(0x48, 0n, true); // p_offset
    view.setBigUint64(0x50, 0n, true); // p_vaddr
    view.setBigUint64(0x60, 0x800n, true); // p_filesz
    view.setBigUint64(0x68, 0x800n, true); // p_memsz

    const dynPh = 0x40 + 56;
    view.setUint32(dynPh, 2, true); // PT_DYNAMIC
    view.setBigUint64(dynPh + 8, 0x440n, true); // p_offset
    view.setBigUint64(dynPh + 16, 0x440n, true); // p_vaddr
    view.setBigUint64(dynPh + 32, 0x60n, true); // p_filesz
    view.setBigUint64(dynPh + 40, 0x60n, true); // p_memsz

    // Section headers
    const shstr = new TextEncoder().encode('\0.dynsym\0.dynstr\0.dynamic\0.shstrtab\0');
    new Uint8Array(buffer, 0x600, shstr.length).set(shstr);

    const writeSh = (index, name, type, flags, addr, offset, size, link = 0, entsize = 0) => {
        const base = 0x300 + index * 64;
        view.setUint32(base, name, true);
        view.setUint32(base + 4, type, true);
        view.setBigUint64(base + 8, BigInt(flags), true);
        view.setBigUint64(base + 16, BigInt(addr), true);
        view.setBigUint64(base + 24, BigInt(offset), true);
        view.setBigUint64(base + 32, BigInt(size), true);
        view.setUint32(base + 40, link, true);
        view.setBigUint64(base + 56, BigInt(entsize), true);
    };

    writeSh(0, 0, 0, 0, 0, 0, 0);
    writeSh(1, 1, 11, 0, 0x480, 0x480, 48, 2, 24); // .dynsym
    writeSh(2, 9, 3, 0, 0x500, 0x500, 32); // .dynstr
    writeSh(3, 17, 6, 0, 0x440, 0x440, 0x60); // .dynamic
    writeSh(4, 26, 3, 0, 0x600, 0x600, shstr.length); // .shstrtab

    const dynstr = new TextEncoder().encode('\0libc.so.6\0puts\0');
    new Uint8Array(buffer, 0x500, dynstr.length).set(dynstr);

    // dynsym entries (skip null)
    const sym1 = 0x480 + 24;
    view.setUint32(sym1, 11, true); // name offset for "puts"
    view.setUint8(sym1 + 4, 0x12); // GLOBAL/FUNC
    view.setUint16(sym1 + 6, 0, true); // undefined => import

    // dynamic entries
    let dynOff = 0x440;
    const writeDyn = (tag, val) => {
        view.setBigUint64(dynOff, BigInt(tag), true);
        view.setBigUint64(dynOff + 8, BigInt(val), true);
        dynOff += 16;
    };
    writeDyn(1, 1); // DT_NEEDED -> "libc.so.6"
    writeDyn(5, 0x500); // DT_STRTAB
    writeDyn(10, 32); // DT_STRSZ
    writeDyn(6, 0x480); // DT_SYMTAB
    writeDyn(11, 24); // DT_SYMENT
    writeDyn(0, 0); // DT_NULL

    return view;
}

function buildMachOView() {
    const buffer = new ArrayBuffer(0x400);
    const view = new DataView(buffer);
    const magic = 0xfeedfacf;

    view.setUint32(0, magic, false); // MH_MAGIC_64 (big-endian)
    view.setUint32(4, 0x01000007, false); // x86_64
    view.setUint32(8, 0, false); // cpusubtype
    view.setUint32(12, 2, false); // executable
    view.setUint32(16, 2, false); // ncmds
    view.setUint32(20, 176, false); // sizeofcmds
    view.setUint32(24, 0, false); // flags

    const segCmdOffset = 32;
    view.setUint32(segCmdOffset, 0x19, false); // LC_SEGMENT_64
    view.setUint32(segCmdOffset + 4, 152, false); // cmdsize
    setString(view, segCmdOffset + 8, '__TEXT');
    view.setBigUint64(segCmdOffset + 24, 0x1000n, false); // vmaddr
    view.setBigUint64(segCmdOffset + 32, 0x2000n, false); // vmsize
    view.setBigUint64(segCmdOffset + 40, 0n, false); // fileoff
    view.setBigUint64(segCmdOffset + 48, 0x200n, false); // filesize
    view.setUint32(segCmdOffset + 60, 5, false); // initprot (R|X)
    view.setUint32(segCmdOffset + 64, 1, false); // nsects

    const sectOffset = segCmdOffset + 72;
    setString(view, sectOffset, '__text');
    view.setBigUint64(sectOffset + 32, 0x1000n, false); // addr
    view.setBigUint64(sectOffset + 40, 0x100n, false); // size
    view.setUint32(sectOffset + 64, 0, false); // flags -> REGULAR

    const symtabOffset = segCmdOffset + 152;
    view.setUint32(symtabOffset, 0x2, false); // LC_SYMTAB
    view.setUint32(symtabOffset + 4, 24, false);
    view.setUint32(symtabOffset + 8, 0x200, false); // symoff
    view.setUint32(symtabOffset + 12, 1, false); // nsyms
    view.setUint32(symtabOffset + 16, 0x220, false); // stroff
    view.setUint32(symtabOffset + 20, 16, false); // strsize

    // symbol table
    view.setUint32(0x200, 1, false); // strx after leading null
    view.setUint8(0x204, 0x0e | 0x01); // type SECT + EXT
    view.setBigUint64(0x208, 0x1000n, false); // value

    // String table starts with a null byte; place "_main" at offset 1.
    setString(view, 0x221, '_main');

    return view;
}

describe('parsers-binary', () => {
    it('handles out-of-bounds PE header reads', () => {
        const view = new DataView(new ArrayBuffer(8));
        expect(parsePE(view)).toEqual({ metadata: {}, e_lfanew: 0 });
    });

    it('parses PE sections edge cases (empty name, BSS, no flags, rawSize=0)', () => {
        const buffer = new ArrayBuffer(512);
        const view = new DataView(buffer);
        const e_lfanew = 0x40;

        // Basic header bits used by parsePESections only.
        setU16(view, e_lfanew + 6, 2, true); // numSec
        setU16(view, e_lfanew + 20, 0, true); // sizeOpt
        const secTable = e_lfanew + 24;

        // Section 0: empty name => SECTION_<offset>, BSS, no flags, rawSize=0 => uses virtualSize.
        setU32(view, secTable + 8, 0x123, true); // virtualSize
        setU32(view, secTable + 12, 0x2000, true); // virtualAddress
        setU32(view, secTable + 16, 0, true); // rawSize
        setU32(view, secTable + 20, 0x100, true); // rawPtr
        setU32(view, secTable + 36, 0x00000080, true); // BSS characteristics only

        // Section 1: explicit name, unknown type => "SECTION", flags "-"
        setString(view, secTable + 40, 'misc');
        setU32(view, secTable + 40 + 8, 0x80, true);
        setU32(view, secTable + 40 + 12, 0x3000, true);
        setU32(view, secTable + 40 + 16, 0x80, true);
        setU32(view, secTable + 40 + 20, 0x200, true);
        setU32(view, secTable + 40 + 36, 0x0, true);

        expect(parsePESections(view, 0)).toEqual([]);

        const sections = parsePESections(view, e_lfanew);
        expect(sections).toHaveLength(2);
        expect(sections[0].name).toBe(`SECTION_${secTable}`);
        expect(sections[0].type).toBe('BSS');
        expect(sections[0].flags).toBe('-');
        expect(sections[0].size).toBe(0x123);
        expect(sections[1].type).toBe('SECTION');
        expect(sections[1].flags).toBe('-');
    });

    it('parses PE headers, sections, symbols, and imports', () => {
        const view = buildPEView();
        const { metadata, e_lfanew } = parsePE(view);
        expect(metadata.Machine).toBe('14c');

        const sections = parsePESections(view, e_lfanew);
        expect(sections.map((s) => s.name)).toEqual(['.text', '.idata']);

        const symbols = parsePESymbols(view, e_lfanew);
        expect(symbols.some((s) => s.name === 'exported' && s.type === 'EXPORT')).toBe(true);
        expect(
            symbols.some((s) => s.name === 'KERNEL32.dll!CreateFile' && s.type === 'IMPORT')
        ).toBe(true);

        const imports = parsePEImports(view, e_lfanew);
        expect(imports['KERNEL32.dll']).toContain('CreateFile');
    });

    it('parses ELF headers, sections, symbols, and imports', () => {
        const view = buildELFView();
        expect(parseELF(view)).toMatchObject({ Arch: 'x64', Class: '64-bit', Endian: 'Little' });

        const sections = parseELFSections(view);
        expect(sections.map((s) => s.name)).toContain('.dynsym');

        const symbols = parseELFSymbols(view);
        expect(symbols.length).toBeGreaterThan(0);

        const imports = parseELFImports(view);
        expect(imports['Shared Libraries (DT_NEEDED)']).toContain('libc.so.6');
        const imported = imports['Imported Functions (Undefined Symbols)'] || [];
        expect(Array.isArray(imported)).toBe(true);
    });

    it('parses Mach-O metadata, sections, and symbols', () => {
        const view = buildMachOView();
        const { metadata, sections, symbols } = parseMachO(view);
        expect(metadata['Mach-O']).toContain('64-bit');
        expect(sections.some((s) => s.name === '__text')).toBe(true);
        expect(symbols.some((s) => s.name === '_main')).toBe(true);
    });

    it('handles Malformed PE', () => {
        const buffer = new ArrayBuffer(100);
        const view = new DataView(buffer);
        // Missing signature
        const res = parsePE(view);
        expect(res.metadata).toEqual({});

        // Malformed Sections
        const sections = parsePESections(view, 0x10);
        expect(sections).toEqual([]);

        // Malformed Imports
        const imports = parsePEImports(view, 0x10);
        expect(imports).toEqual({});

        // Malformed Symbols
        const symbols = parsePESymbols(view, 0x10);
        expect(symbols).toEqual([]);
    });

    it('handles Malformed ELF', () => {
        const buffer = new ArrayBuffer(100);
        const view = new DataView(buffer);
        expect(parseELF(view)).toBe(false);
        expect(parseELFSections(view)).toEqual([]);
        expect(parseELFSymbols(view)).toEqual([]);
        expect(parseELFImports(view)).toEqual({});
    });

    it('handles Malformed Mach-O', () => {
        const buffer = new ArrayBuffer(100);
        const view = new DataView(buffer);
        const res = parseMachO(view);
        expect(res.metadata).toEqual({});
    });

    it('parses PE exports without names and forwarder exports, plus ordinal imports (symbols)', () => {
        const buffer = new ArrayBuffer(0x4000);
        const view = new DataView(buffer);
        const e_lfanew = 0x100;
        setU32(view, 0x3c, e_lfanew, true);
        setU32(view, e_lfanew, 0x4550, true); // PE signature
        setU16(view, e_lfanew + 6, 1, true); // num sections
        setU16(view, e_lfanew + 20, 0xe0, true); // optional header size

        const optHeader = e_lfanew + 24;
        setU16(view, optHeader, 0x10b, true); // PE32
        setU32(view, optHeader + 92, 2, true); // number of data directories
        setU32(view, optHeader + 96, 0x2000, true); // export RVA
        setU32(view, optHeader + 104, 0x3000, true); // import RVA

        const secTable = optHeader + 0xe0;
        setString(view, secTable, '.rdata');
        setU32(view, secTable + 8, 0x2000, true); // vSize
        setU32(view, secTable + 12, 0x2000, true); // vAddr
        setU32(view, secTable + 16, 0x2000, true); // rawSize
        setU32(view, secTable + 20, 0x400, true); // rawPtr

        // Export directory at RVA 0x2000 => off 0x400
        const exportDir = 0x400;
        setU32(view, exportDir + 16, 5, true); // ordinal base
        setU32(view, exportDir + 20, 1, true); // num funcs
        setU32(view, exportDir + 24, 0, true); // num names => forces ordinal-only path
        setU32(view, exportDir + 28, 0x2100, true); // func table RVA

        const funcTableOff = 0x500; // RVA 0x2100 => off (0x2100-0x2000)+0x400 = 0x500
        setU32(view, funcTableOff, 0x2050, true); // func RVA points into export dir => forwarder

        // Forwarder string at RVA 0x2050 => off 0x450
        setString(view, 0x450, 'KERNEL32.Sleep');

        // Import descriptor at RVA 0x3000 => off 0x1400
        const importDescOff = 0x1400;
        setU32(view, importDescOff + 12, 0x3100, true); // name RVA
        setU32(view, importDescOff + 16, 0x3200, true); // thunk RVA (FirstThunk)
        setString(view, 0x1500, 'ORDDLL.dll'); // RVA 0x3100 => off 0x1500

        // Thunks at RVA 0x3200 => off 0x1600
        setU32(view, 0x1600, 0x80000007, true); // ordinal import (ordinal=7)
        setU32(view, 0x1604, 0x3300, true); // hint/name import RVA
        setU32(view, 0x1608, 0, true); // terminator

        // Hint/name entry at RVA 0x3300 => off 0x1700
        setU16(view, 0x1700, 42, true); // hint
        setString(view, 0x1702, 'ByName');

        const symbols = parsePESymbols(view, e_lfanew);
        expect(symbols.some((s) => s.type === 'EXPORT' && s.name === 'ord_5')).toBe(true);
        expect(symbols.some((s) => s.type === 'EXPORT' && s.address === 'fwd:KERNEL32.Sleep')).toBe(
            true
        );
        expect(symbols.some((s) => s.type === 'IMPORT' && s.name === 'ORDDLL.dll!ord_7')).toBe(
            true
        );
        expect(symbols.some((s) => s.type === 'IMPORT' && s.name === 'ORDDLL.dll!ByName')).toBe(
            true
        );
    });

    it('parses PE with COFF Symbol Table (Fallback)', () => {
        const buffer = new ArrayBuffer(1024);
        const view = new DataView(buffer);
        const e_lfanew = 0x40;
        view.setUint32(0x3c, e_lfanew, true);
        view.setUint32(e_lfanew, 0x4550, true); // PE

        // COFF Header
        // PointerToSymbolTable at offset 8
        view.setUint32(e_lfanew + 8, 0x100, true);
        // NumberOfSymbols at offset 12
        view.setUint32(e_lfanew + 12, 1, true);

        // Symbol Table at 0x100
        // Symbol Entry (18 bytes)
        // Name: "MySym" (Short name <= 8 chars)
        setString(view, 0x100, 'MySym');
        view.setUint32(0x100 + 8, 0x1000, true); // Value
        view.setUint16(0x100 + 14, 0, true); // Type (0 = NULL)
        view.setUint8(0x100 + 16, 2); // StorageClass 2 (External)
        view.setUint8(0x100 + 17, 0); // AuxSymbols 0

        const symbols = parsePESymbols(view, e_lfanew);
        expect(symbols).toContainEqual({
            name: 'MySym',
            type: 'COFF/EXTERNAL',
            address: '0x1000',
            size: 0
        });
    });

    it('parses COFF symbols with long names via string table', () => {
        const buffer = new ArrayBuffer(1024);
        const view = new DataView(buffer);
        const e_lfanew = 0x40;
        setU32(view, 0x3c, e_lfanew, true);
        setU32(view, e_lfanew, 0x4550, true); // PE

        const symTablePtr = 0x200;
        setU32(view, e_lfanew + 8, symTablePtr, true);
        setU32(view, e_lfanew + 12, 1, true); // one symbol

        // One symbol entry (18 bytes) with long name reference
        setU32(view, symTablePtr, 0, true); // first 4 bytes zero => long name
        setU32(view, symTablePtr + 4, 4, true); // string table offset
        setU32(view, symTablePtr + 8, 0x1234, true); // value
        setU16(view, symTablePtr + 14, 0x10, true); // type
        view.setUint8(symTablePtr + 16, 105); // StorageClass 105 (FILE)
        view.setUint8(symTablePtr + 17, 0); // AuxSymbols 0

        const stringTableOffset = symTablePtr + 18;
        setU32(view, stringTableOffset, 64, true); // string table size
        setString(view, stringTableOffset + 4, 'VeryLongSymbolName');

        const symbols = parsePESymbols(view, e_lfanew);
        expect(symbols.some((s) => s.type === 'COFF/FILE' && s.name === 'VeryLongSymbolName')).toBe(
            true
        );
    });

    it('parses PE64 imports with ordinal and name (imports)', () => {
        const buffer = new ArrayBuffer(0x4000);
        const view = new DataView(buffer);
        const e_lfanew = 0x80;
        setU32(view, 0x3c, e_lfanew, true);
        setU32(view, e_lfanew, 0x4550, true); // PE
        setU16(view, e_lfanew + 6, 1, true); // num sections
        setU16(view, e_lfanew + 20, 0xf0, true); // optional header size

        const optHeader = e_lfanew + 24;
        setU16(view, optHeader, 0x20b, true); // PE32+
        // import data directory at optHeader + 112 + 8
        setU32(view, optHeader + 120, 0x2000, true); // import RVA

        const secTable = optHeader + 0xf0;
        setString(view, secTable, '.idata');
        setU32(view, secTable + 8, 0, true); // vSize=0 => use rawSize in rvaToOffset
        setU32(view, secTable + 12, 0x2000, true); // vAddr
        setU32(view, secTable + 16, 0x2000, true); // rawSize
        setU32(view, secTable + 20, 0x400, true); // rawPtr

        // Import descriptor at RVA 0x2000 => off 0x400
        const descOff = 0x400;
        setU32(view, descOff, 0, true);
        setU32(view, descOff + 12, 0x5000, true); // name RVA (won't map) => dll stays Unknown
        setU32(view, descOff + 16, 0x2100, true); // thunk RVA

        // Thunks at RVA 0x2100 => off 0x500
        // Ordinal import: high bit in high dword
        setU32(view, 0x500, 123, true); // low
        setU32(view, 0x504, 0x80000000, true); // high => ordinal
        // Name import: high=0, low=rva of hint/name
        setU32(view, 0x508, 0x2300, true);
        setU32(view, 0x50c, 0, true);
        // Terminator
        setU32(view, 0x510, 0, true);
        setU32(view, 0x514, 0, true);

        // Hint/name at RVA 0x2300 => off 0x700
        setU16(view, 0x700, 7, true);
        setString(view, 0x702, 'Func64');

        const imports = parsePEImports(view, e_lfanew);
        expect(imports.Unknown).toEqual(['Ordinal 123', 'Func64']);
        expect(parsePEImports(view, 0)).toEqual({});
    });

    it('parses 32-bit ELF', () => {
        const buffer = new ArrayBuffer(0x400);
        const view = new DataView(buffer);
        view.setUint32(0, 0x7f454c46, false); // Magic
        view.setUint8(4, 1); // 1 = 32-bit
        view.setUint8(5, 1); // Little Endian
        view.setUint16(18, 0x03, true); // x86

        const res = parseELF(view);
        expect(res.Class).toBe('32-bit');
        expect(res.Arch).toBe('x86');
    });

    it('parses ELF sections when shstrtab is missing/invalid and exercises flag letters', () => {
        const buffer = new ArrayBuffer(0x800);
        const view = new DataView(buffer);
        const u8 = new Uint8Array(buffer);
        u8.set([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00], 0); // 64-bit LE ELF

        const e_shoff = 0x100;
        view.setBigUint64(40, BigInt(e_shoff), true);
        view.setUint16(58, 64, true); // e_shentsize
        view.setUint16(60, 2, true); // e_shnum
        view.setUint16(62, 1, true); // e_shstrndx

        // Section 0 header at 0x100: nameOff=0, type=PROGBITS, flags set to all known bits.
        setU32(view, 0x100 + 0, 0, true);
        setU32(view, 0x100 + 4, 1, true); // PROGBITS
        view.setBigUint64(
            0x100 + 8,
            0x1n | 0x2n | 0x4n | 0x10n | 0x20n | 0x40n | 0x80n | 0x100n | 0x200n | 0x400n | 0x800n,
            true
        );

        // shstrtab header at 0x140: set first u32 to 0 => treated as invalid/missing.
        setU32(view, 0x140 + 0, 0, true);
        setU32(view, 0x140 + 4, 3, true); // STRTAB

        const sections = parseELFSections(view);
        expect(sections[0].name).toBe('SECTION_0');
        expect(sections[0].flags).toBe('WAXMSILOGTC');
        expect(sections[1].name).toBe('SECTION_1');
    });

    it('parses 32-bit ELF symbols', () => {
        const buffer = new ArrayBuffer(0x400);
        const view = new DataView(buffer);
        const u8 = new Uint8Array(buffer);
        u8.set([0x7f, 0x45, 0x4c, 0x46, 0x01, 0x01, 0x01, 0x00], 0); // 32-bit LE ELF

        const e_shoff = 0x100;
        setU32(view, 32, e_shoff, true);
        setU16(view, 46, 40, true); // e_shentsize
        setU16(view, 48, 3, true); // e_shnum

        // Section 1: DYNSYM at 0x200, size 32, link to strtab (section 2), entsize 16
        const sh1 = e_shoff + 1 * 40;
        setU32(view, sh1 + 4, 11, true); // SHT_DYNSYM
        setU32(view, sh1 + 16, 0x200, true); // sh_offset
        setU32(view, sh1 + 20, 32, true); // sh_size
        setU32(view, sh1 + 24, 2, true); // sh_link => strtab
        setU32(view, sh1 + 36, 16, true); // sh_entsize

        // Section 2: STRTAB at 0x300
        const sh2 = e_shoff + 2 * 40;
        setU32(view, sh2 + 4, 3, true); // SHT_STRTAB
        setU32(view, sh2 + 16, 0x300, true);
        setU32(view, sh2 + 20, 16, true);

        // String table: "\0mysym\0"
        setString(view, 0x300, '');
        setString(view, 0x301, 'mysym');

        // Symbol 0 (null) left as zeros. Symbol 1 at 0x200 + 16.
        const sym1 = 0x200 + 16;
        setU32(view, sym1 + 0, 1, true); // name offset => "mysym"
        setU32(view, sym1 + 4, 0x1234, true); // value
        setU32(view, sym1 + 8, 0x10, true); // size
        view.setUint8(sym1 + 12, (1 << 4) | 2); // GLOBAL/FUNC

        const symbols = parseELFSymbols(view);
        expect(symbols.some((s) => s.name === 'mysym' && s.type === 'GLOBAL/FUNC')).toBe(true);
    });

    it('parses 32-bit ELF imports via PT_DYNAMIC segment and DT_HASH sizing', () => {
        const buffer = new ArrayBuffer(0x2000);
        const view = new DataView(buffer);
        const u8 = new Uint8Array(buffer);
        u8.set([0x7f, 0x45, 0x4c, 0x46, 0x01, 0x01, 0x01, 0x00], 0); // 32-bit LE ELF

        // Program headers
        const e_phoff = 0x34;
        setU32(view, 28, e_phoff, true);
        setU16(view, 42, 32, true); // e_phentsize
        setU16(view, 44, 2, true); // e_phnum

        // No section headers => forces fallback to PT_DYNAMIC.
        setU32(view, 32, 0, true); // e_shoff
        setU16(view, 48, 0, true); // e_shnum

        // PT_LOAD mapping vaddr 0x1000 -> fileOff 0
        const ph0 = e_phoff;
        setU32(view, ph0 + 0, 1, true); // PT_LOAD
        setU32(view, ph0 + 4, 0, true); // p_offset
        setU32(view, ph0 + 8, 0x1000, true); // p_vaddr
        setU32(view, ph0 + 16, 0x2000, true); // p_filesz
        setU32(view, ph0 + 20, 0x3000, true); // p_memsz

        // PT_DYNAMIC at fileOff 0x400
        const ph1 = e_phoff + 32;
        setU32(view, ph1 + 0, 2, true); // PT_DYNAMIC
        setU32(view, ph1 + 4, 0x400, true); // p_offset
        setU32(view, ph1 + 8, 0x1400, true); // p_vaddr
        setU32(view, ph1 + 16, 0x100, true); // p_filesz
        setU32(view, ph1 + 20, 0x100, true); // p_memsz

        // dynstr at file offset 0x800 => addr 0x1800
        const dynstrOff = 0x800;
        new Uint8Array(buffer, dynstrOff, 32).set(new TextEncoder().encode('\0libc.so.6\0puts\0'));

        // hash table at file offset 0x700 => addr 0x1700; nchain=2 => dynSymSize=2*16=32
        const hashOff = 0x700;
        setU32(view, hashOff + 0, 1, true); // nbucket
        setU32(view, hashOff + 4, 2, true); // nchain

        // dynsym at file offset 0x900 => addr 0x1900; entry 0 is null.
        const dynsymOff = 0x900;
        const sym1 = dynsymOff + 16;
        setU32(view, sym1 + 0, 11, true); // nameIdx => "puts"
        view.setUint8(sym1 + 12, (2 << 4) | 2); // WEAK/FUNC (binding=2)
        setU16(view, sym1 + 14, 0, true); // shndx=0 => undefined/import

        // Dynamic table entries (tag,val) at fileOff 0x400
        const dynOff = 0x400;
        const writeDyn = (idx, tag, val) => {
            setU32(view, dynOff + idx * 8, tag, true);
            setU32(view, dynOff + idx * 8 + 4, val, true);
        };
        writeDyn(0, 1, 1); // DT_NEEDED => "libc.so.6"
        writeDyn(1, 5, 0x1800); // DT_STRTAB
        writeDyn(2, 6, 0x1900); // DT_SYMTAB
        writeDyn(3, 4, 0x1700); // DT_HASH
        writeDyn(4, 11, 16); // DT_SYMENT
        writeDyn(5, 0, 0); // DT_NULL

        const imports = parseELFImports(view);
        expect(imports['Shared Libraries (DT_NEEDED)']).toEqual(['libc.so.6']);
        expect(imports['Imported Functions (Undefined Symbols)']).toEqual(['puts']);
    });

    it('parses Mach-O fat binaries and segment-only entries', () => {
        const buffer = new ArrayBuffer(0x800);
        const view = new DataView(buffer);

        // FAT magic: the parser treats the header as little-endian when magicLE matches FAT_MAGIC.
        view.setUint32(0, 0xcafebabe, true);
        view.setUint32(4, 1, true); // nfat

        // One fat_arch at 8; offset field is at 16.
        view.setUint32(8, 0x01000007, true); // cputype => x86_64
        view.setUint32(12, 0, true); // cpusubtype
        view.setUint32(16, 0x100, true); // offset
        view.setUint32(20, 0x200, true); // size
        view.setUint32(24, 0, true); // align

        // Inner Mach-O at 0x100: write MH_CIGAM_64 as magicBE to trigger innerLittle=true.
        view.setUint32(0x100, 0xcffaedfe, false);
        view.setUint32(0x104, 0x01000007, true); // cputype (little because isLittle=true)
        view.setUint32(0x108, 1, true); // cpusubtype => should appear in metadata
        view.setUint32(0x10c, 2, true); // filetype
        view.setUint32(0x110, 1, true); // ncmds
        view.setUint32(0x114, 72, true); // sizeofcmds

        // One LC_SEGMENT_64 with 0 sections, initprot=0 => flags "-"
        const cmdOff = 0x100 + 32;
        view.setUint32(cmdOff, 0x19, true);
        view.setUint32(cmdOff + 4, 72, true);
        setString(view, cmdOff + 8, '__ZERO');
        view.setBigUint64(cmdOff + 24, 0x1000n, true); // vmaddr
        view.setBigUint64(cmdOff + 32, 0x2000n, true); // vmsize
        view.setBigUint64(cmdOff + 40, 0x0n, true); // fileoff
        view.setBigUint64(cmdOff + 48, 0x0n, true); // filesize
        view.setUint32(cmdOff + 60, 0, true); // initprot
        view.setUint32(cmdOff + 64, 0, true); // nsects

        const res = parseMachO(view);
        expect(res.metadata['Mach-O']).toContain('Fat binary');
        expect(res.metadata.Arch).toBe('x86_64');
        expect(res.metadata['CPU Subtype']).toBe(1);
        expect(res.sections.some((s) => s.type === 'SEGMENT' && s.flags === '-')).toBe(true);
    });
});
