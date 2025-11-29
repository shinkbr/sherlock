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
} from '../js/parsers-binary.js';

function setString(view, offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    view.setUint8(offset + str.length, 0);
}

function buildPEView() {
    const buffer = new ArrayBuffer(4096);
    const view = new DataView(buffer);
    const e_lfanew = 0x80;

    view.setUint32(0x3C, e_lfanew, true);
    view.setUint32(e_lfanew, 0x4550, true); // "PE\0\0"
    view.setUint16(e_lfanew + 4, 0x14C, true);
    view.setUint16(e_lfanew + 6, 2, true); // two sections
    view.setUint32(e_lfanew + 8, 0x5E2D1B3A, true); // timestamp
    view.setUint16(e_lfanew + 20, 0xE0, true); // optional header size

    const optHeader = e_lfanew + 24;
    view.setUint16(optHeader, 0x10B, true); // PE32
    view.setUint32(optHeader + 92, 2, true); // number of data directories
    view.setUint32(optHeader + 96, 0x2000, true); // export RVA
    view.setUint32(optHeader + 104, 0x3000, true); // import RVA

    const secTable = optHeader + 0xE0;
    const writeSection = (offset, name, vaddr, rawPtr, charact) => {
        setString(view, offset, name);
        view.setUint32(offset + 8, 0x200, true); // virtual size
        view.setUint32(offset + 12, vaddr, true);
        view.setUint32(offset + 16, 0x200, true); // raw size
        view.setUint32(offset + 20, rawPtr, true);
        view.setUint32(offset + 36, charact, true);
    };

    writeSection(secTable, '.text', 0x2000, 0x400, 0x60000020);
    writeSection(secTable + 40, '.idata', 0x3000, 0xA00, 0xC0000040);

    // Export table
    const exportDir = 0x400;
    view.setUint32(exportDir + 16, 1, true); // ordinal base
    view.setUint32(exportDir + 20, 1, true); // num funcs
    view.setUint32(exportDir + 24, 1, true); // num names
    view.setUint32(exportDir + 28, 0x2100, true); // func table RVA
    view.setUint32(exportDir + 32, 0x2140, true); // name table RVA
    view.setUint32(exportDir + 36, 0x2180, true); // ord table RVA

    view.setUint32(0x500, 0x2000, true); // func table entry
    view.setUint32(0x540, 0x21C0, true); // name table entry
    view.setUint16(0x580, 0, true); // ordinal table entry
    setString(view, 0x5C0, 'exported');

    // Import table
    const impDesc = 0xA00;
    view.setUint32(impDesc + 12, 0x3050, true); // name RVA
    view.setUint32(impDesc + 16, 0x3060, true); // thunk RVA
    setString(view, 0xA50, 'KERNEL32.dll');
    view.setUint32(0xA60, 0x3080, true); // first thunk entry
    view.setUint16(0xA80, 1, true); // hint
    setString(view, 0xA82, 'CreateFile');

    return view;
}

function buildELFView() {
    const buffer = new ArrayBuffer(0x800);
    const view = new DataView(buffer);
    const u8 = new Uint8Array(buffer);
    u8.set([0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01, 0x00], 0);

    view.setUint16(18, 0x3E, true); // x86_64
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
    const magic = 0xFEEDFACF;

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
    view.setUint8(0x204, 0x0E | 0x01); // type SECT + EXT
    view.setBigUint64(0x208, 0x1000n, false); // value

    // String table starts with a null byte; place "_main" at offset 1.
    setString(view, 0x221, '_main');

    return view;
}

describe('parsers-binary', () => {
    it('parses PE headers, sections, symbols, and imports', () => {
        const view = buildPEView();
        const { metadata, e_lfanew } = parsePE(view);
        expect(metadata.Machine).toBe('14c');

        const sections = parsePESections(view, e_lfanew);
        expect(sections.map(s => s.name)).toEqual(['.text', '.idata']);

        const symbols = parsePESymbols(view, e_lfanew);
        expect(symbols.some(s => s.name === 'exported' && s.type === 'EXPORT')).toBe(true);
        expect(symbols.some(s => s.name === 'KERNEL32.dll!CreateFile' && s.type === 'IMPORT')).toBe(true);

        const imports = parsePEImports(view, e_lfanew);
        expect(imports['KERNEL32.dll']).toContain('CreateFile');
    });

    it('parses ELF headers, sections, symbols, and imports', () => {
        const view = buildELFView();
        expect(parseELF(view)).toMatchObject({ Arch: 'x64', Class: '64-bit', Endian: 'Little' });

        const sections = parseELFSections(view);
        expect(sections.map(s => s.name)).toContain('.dynsym');

        const symbols = parseELFSymbols(view);
        expect(symbols.length).toBeGreaterThan(0);

        const imports = parseELFImports(view);
        expect(imports['Shared Libraries (DT_NEEDED)']).toContain('libc.so.6');
        expect(imports['Imported Functions (Undefined Symbols)']).toContain('puts');
    });

    it('parses Mach-O metadata, sections, and symbols', () => {
        const view = buildMachOView();
        const { metadata, sections, symbols } = parseMachO(view);
        expect(metadata['Mach-O']).toContain('64-bit');
        expect(sections.some(s => s.name === '__text')).toBe(true);
        expect(symbols.some(s => s.name === '_main')).toBe(true);
    });
});
