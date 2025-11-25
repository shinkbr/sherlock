(() => {
    const { Icons } = window;

    const Header = () => (
        <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center gap-3">
                        <div className="text-cyan-400"><Icons.Search /></div>
                        <span className="text-xl font-bold tracking-tight text-white">
                            Sherlock <span className="text-slate-500 font-normal text-sm">| File Forensics</span>
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <a href="https://github.com/shinkbr/sherlock" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-cyan-400 transition-colors">
                            <Icons.Github />
                        </a>
                    </div>
                </div>
            </div>
        </nav>
    );

    const DropZone = ({ onFileSelect, isAnalyzing }) => {
        const [isDragging, setIsDragging] = React.useState(false);

        const handleDrop = (e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files.length) onFileSelect(e.dataTransfer.files[0]);
        };

        return (
            <div
                className={`drop-zone relative h-64 flex flex-col items-center justify-center cursor-pointer rounded-2xl mb-8 border-2 border-dashed transition-all ${isDragging ? 'active border-cyan-400' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById('fileInput').click()}
            >
                <input type="file" id="fileInput" className="hidden" onChange={(e) => e.target.files.length && onFileSelect(e.target.files[0])} />

                {isAnalyzing ? (
                    <div className="text-center">
                        <div className="inline-block w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mb-4"></div>
                        <p className="text-slate-400 animate-pulse font-mono">Analyzing binary...</p>
                    </div>
                ) : (
                    <div className="text-center">
                        <div className="inline-block p-4 rounded-full bg-slate-800 mb-4 text-cyan-400"><Icons.Upload /></div>
                        <p className="text-lg font-medium text-slate-200">Drag & Drop or <span className="text-cyan-400">Browse</span></p>
                        <p className="text-sm text-slate-500 mt-2">Supports Docs, Images, Videos, Archives, Executables, etc.</p>
                        <p className="text-sm text-slate-500">Files are processed in-browser and never uploaded anywhere.</p>
                    </div>
                )}
            </div>
        );
    };

    const InfoCard = ({ data }) => (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 shadow-lg">
            <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">{data.name}</h2>
                    <div className="flex gap-3 text-sm text-slate-400 font-mono">
                        <span>{data.size}</span><span>|</span><span>{data.type || 'Unknown Type'}</span>
                    </div>
                </div>
                <div className="text-right">
                    <div className="px-3 py-1 bg-cyan-500/10 text-cyan-400 text-xs font-bold rounded border border-cyan-500/20 inline-block mb-1">
                        {data.detectedFormat}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">Magic: {data.magic.substring(0, 16)}...</div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <HashBox label="SHA-256" value={data.hashes.sha256} />
                <HashBox label="SHA-1" value={data.hashes.sha1} />
                <HashBox label="MD5" value={data.hashes.md5} />
                <HashBox label="CRC32" value={data.hashes.crc32} />

                <div className="bg-slate-900/50 p-3 rounded border border-slate-700/50 md:col-span-2">
                    <div className="flex justify-between mb-2 text-xs font-bold text-slate-500 uppercase">
                        <span>Entropy</span><span className="font-mono text-cyan-200">{data.entropy.value.toFixed(3)}</span>
                    </div>
                    <div className="w-full bg-slate-700/50 rounded-full h-2">
                        <div className={`h-2 rounded-full ${data.entropy.value > 7.2 ? 'bg-red-500' : 'bg-cyan-500'}`} style={{ width: `${data.entropy.percentage}%` }}></div>
                    </div>
                </div>
            </div>
        </div>
    );

    const HashBox = ({ label, value, className = "" }) => (
        <div className={`bg-slate-900/50 p-3 rounded border border-slate-700/50 ${className}`}>
            <span className="text-xs text-slate-500 uppercase font-bold block mb-1">{label}</span>
            <code className="text-xs text-cyan-200 break-all select-all font-mono">{value || "Calculating..."}</code>
        </div>
    );

    const MetadataSection = ({ title, data, children, icon }) => {
        const Icon = Icons[icon];
        if ((!data || Object.keys(data).length === 0) && !children) return null;
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="bg-slate-900/50 px-6 py-3 border-b border-slate-700 flex items-center gap-2">
                    {Icon && <div className="text-cyan-400"><Icon /></div>}
                    <h3 className="font-semibold text-slate-200">{title}</h3>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                        {data && Object.entries(data).map(([k, v]) => (
                            <div key={k}>
                                <span className="text-xs text-slate-500 uppercase font-bold block mb-1">{k}</span>
                                <span className="text-sm text-slate-200 font-mono break-words">{v}</span>
                            </div>
                        ))}
                    </div>
                    {children}
                </div>
            </div>
        );
    };

    const SectionsSection = ({ sections }) => {
        if (!sections || !sections.length) return null;
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="bg-slate-900/50 px-6 py-3 border-b border-slate-700 flex items-center gap-2">
                    <div className="text-cyan-400"><Icons.Layers /></div>
                    <h3 className="font-semibold text-slate-200">Sections</h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-left text-sm text-slate-400">
                        <thead className="bg-slate-950 text-slate-500 font-medium sticky top-0">
                            <tr>
                                <th className="px-6 py-3">Name</th>
                                <th className="px-6 py-3">Type</th>
                                <th className="px-6 py-3 text-right">Address</th>
                                <th className="px-6 py-3 text-right">Offset</th>
                                <th className="px-6 py-3 text-right">Size</th>
                                <th className="px-6 py-3 text-right">Flags</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50 font-mono text-xs">
                            {sections.map((s, i) => (
                                <tr key={i} className="hover:bg-slate-700/30">
                                    <td className="px-6 py-2 text-slate-300 truncate max-w-xs" title={s.name}>{s.name}</td>
                                    <td className="px-6 py-2">{s.type}</td>
                                    <td className="px-6 py-2 text-right">{s.address}</td>
                                    <td className="px-6 py-2 text-right">{s.offset}</td>
                                    <td className="px-6 py-2 text-right">{s.size}</td>
                                    <td className="px-6 py-2 text-right">{s.flags}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const ArchiveSection = ({ files }) => {
        if (!files || !files.length) return null;
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="bg-slate-900/50 px-6 py-3 border-b border-slate-700 flex items-center gap-2">
                    <div className="text-cyan-400"><Icons.FolderOpen /></div>
                    <h3 className="font-semibold text-slate-200">Archive Contents</h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-left text-sm text-slate-400">
                        <thead className="bg-slate-950 text-slate-500 font-medium sticky top-0">
                            <tr><th className="px-6 py-3">File Name</th><th className="px-6 py-3 text-right">Size</th><th className="px-6 py-3 text-right">CRC32</th><th className="px-6 py-3 text-right">Enc</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50 font-mono text-xs">
                            {files.map((f, i) => (
                                <tr key={i} className="hover:bg-slate-700/30">
                                    <td className="px-6 py-2 text-slate-300 truncate max-w-xs" title={f.name}>{f.name}</td>
                                    <td className="px-6 py-2 text-right">{f.size}</td>
                                    <td className="px-6 py-2 text-right text-cyan-600">{f.crc || "N/A"}</td>
                                    <td className="px-6 py-2 text-right">{f.encrypted ? "🔒" : ""}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const ImportsSection = ({ imports }) => {
        if (!imports || !Object.keys(imports).length) return null;
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="bg-slate-900/50 px-6 py-3 border-b border-slate-700 flex items-center gap-2">
                    <div className="text-cyan-400"><Icons.Layers /></div>
                    <h3 className="font-semibold text-slate-200">Imports</h3>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                    {Object.entries(imports).map(([dll, funcs], i) => (
                        <div key={i} className="bg-slate-900/50 border border-slate-700 rounded p-3">
                            <h4 className="text-sm font-bold text-slate-200 mb-2 text-cyan-400">{dll}</h4>
                            <div className="text-[10px] text-slate-400 font-mono space-y-1">
                                {funcs.map((f, j) => <div key={j} className="truncate" title={f}>• {f}</div>)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const SymbolsSection = ({ symbols }) => {
        if (!symbols || !symbols.length) return null;
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="bg-slate-900/50 px-6 py-3 border-b border-slate-700 flex items-center gap-2">
                    <div className="text-cyan-400"><Icons.Binary /></div>
                    <h3 className="font-semibold text-slate-200">Symbols</h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-left text-sm text-slate-400">
                        <thead className="bg-slate-950 text-slate-500 font-medium sticky top-0">
                            <tr>
                                <th className="px-6 py-3">Name</th>
                                <th className="px-6 py-3">Type</th>
                                <th className="px-6 py-3 text-right">Address</th>
                                <th className="px-6 py-3 text-right">Size</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50 font-mono text-xs">
                            {symbols.map((s, i) => (
                                <tr key={i} className="hover:bg-slate-700/30">
                                    <td className="px-6 py-2 text-slate-300 truncate max-w-xs" title={s.name}>{s.name}</td>
                                    <td className="px-6 py-2">{s.type}</td>
                                    <td className="px-6 py-2 text-right">{s.address}</td>
                                    <td className="px-6 py-2 text-right">{s.size !== undefined && s.size !== "" ? s.size : "-"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const HexSection = ({ data, totalSize, onDownloadAll }) => {
        const [isDownloading, setIsDownloading] = React.useState(false);
        const rows = [];
        for (let i = 0; i < Math.ceil(data.length / 16); i++) {
            const offset = (i * 16).toString(16).padStart(8, '0').toUpperCase();
            let hex = '', ascii = '';
            for (let j = 0; j < 16; j++) {
                const idx = i * 16 + j;
                if (idx < data.length) {
                    hex += data[idx].toString(16).padStart(2, '0').toUpperCase() + ' ';
                    ascii += (data[idx] >= 32 && data[idx] <= 126) ? String.fromCharCode(data[idx]) : '.';
                } else hex += '   ';
            }
            rows.push({ offset, hex, ascii });
        }
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="bg-slate-900/50 px-6 py-3 border-b border-slate-700 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <div className="text-cyan-400"><Icons.Binary /></div>
                        <h3 className="font-semibold text-slate-200">Hex View</h3>
                    </div>
                    <button
                        className="text-xs px-3 py-1 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={async () => {
                            if (!onDownloadAll) return;
                            try {
                                setIsDownloading(true);
                                await onDownloadAll();
                            } catch (e) {
                                alert("Error downloading hex dump: " + e.message);
                            } finally {
                                setIsDownloading(false);
                            }
                        }}
                        disabled={!onDownloadAll || isDownloading}
                        title={onDownloadAll ? "" : "Reload file to enable download"}
                    >
                        {isDownloading ? "Preparing..." : "Download full dump"}
                    </button>
                </div>
                <div className="p-4 bg-slate-950 overflow-auto font-mono text-sm flex flex-col items-center max-h-[48rem]">
                    <div className="grid grid-cols-[min-content_1fr_min-content] gap-4 w-fit">
                        {rows.map((r, i) => (
                            <React.Fragment key={i}>
                                <div className="text-cyan-600/70 select-none">{r.offset}</div>
                                <div className="text-slate-300 whitespace-pre">{r.hex}</div>
                                <div className="text-slate-400 whitespace-pre tracking-widest">{r.ascii}</div>
                            </React.Fragment>
                        ))}
                    </div>
                    {totalSize && totalSize > data.length && (
                        <div className="text-[10px] text-slate-500 mt-3 self-start">
                            Showing first {data.length} bytes of {totalSize}. Download full dump to view everything.
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const StringsSection = ({ strings, fileName, onDownloadAll }) => {
        if (!strings || !strings.length) return null;
        const [isDownloading, setIsDownloading] = React.useState(false);
        const isTruncated = strings.length >= 1000;

        const handleDownload = async () => {
            if (!onDownloadAll) return;
            try {
                setIsDownloading(true);
                await onDownloadAll();
            } catch (e) {
                alert("Error downloading strings: " + e.message);
            } finally {
                setIsDownloading(false);
            }
        };
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="bg-slate-900/50 px-6 py-3 border-b border-slate-700 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <div className="text-cyan-400"><Icons.FileText /></div>
                        <h3 className="font-semibold text-slate-200">Strings</h3>
                    </div>
                    <button
                        className="text-xs px-3 py-1 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={handleDownload}
                        disabled={!onDownloadAll || isDownloading}
                        title={onDownloadAll ? "" : "Reload file to enable download"}
                    >
                        {isDownloading ? "Preparing..." : "Download all"}
                    </button>
                </div>
                <div className="p-4 bg-slate-950 max-h-96 overflow-y-auto font-mono text-xs text-slate-200 space-y-1">
                    {strings.map((s, i) => (
                        <div key={i} className="whitespace-pre-wrap break-words">{s}</div>
                    ))}
                    {isTruncated && (
                        <div className="text-slate-500 text-[10px] mt-2">
                            Showing first {strings.length} strings. Download all to get the full list.
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const MapViewer = ({ gps }) => {
        if (!gps) return null;
        return (
            <div className="mt-4 rounded-lg overflow-hidden border border-slate-700 bg-slate-900 relative h-64">
                <iframe width="100%" height="100%" frameBorder="0" scrolling="no" style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg) brightness(95%)' }} src={`https://maps.google.com/maps?q=${gps.lat},${gps.lon}&z=14&output=embed`}></iframe>
                <a href={`https://www.google.com/maps?q=${gps.lat},${gps.lon}`} target="_blank" className="absolute bottom-2 right-2 bg-slate-900/80 text-xs px-2 py-1 rounded text-white backdrop-blur flex items-center gap-1 hover:text-cyan-400">
                    Open External <Icons.MapPin />
                </a>
            </div>
        );
    };

    window.Components = {
        Header,
        DropZone,
        InfoCard,
        HashBox,
        MetadataSection,
        SectionsSection,
        SymbolsSection,
        ArchiveSection,
        ImportsSection,
        HexSection,
        StringsSection,
        MapViewer
    };
})();
