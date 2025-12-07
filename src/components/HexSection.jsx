import React from 'react';
import { Icons } from './Icons';

export const HexSection = ({ data, totalSize, onDownloadAll }) => {
    const [isDownloading, setIsDownloading] = React.useState(false);
    const rows = [];
    for (let i = 0; i < Math.ceil(data.length / 16); i++) {
        const offset = (i * 16).toString(16).padStart(8, '0').toUpperCase();
        let hex = '',
            ascii = '';
        for (let j = 0; j < 16; j++) {
            const idx = i * 16 + j;
            if (idx < data.length) {
                hex += data[idx].toString(16).padStart(2, '0').toUpperCase() + ' ';
                ascii += data[idx] >= 32 && data[idx] <= 126 ? String.fromCharCode(data[idx]) : '.';
            } else hex += '   ';
        }
        rows.push({ offset, hex, ascii });
    }
    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="bg-slate-900/50 px-6 py-3 border-b border-slate-700 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <div className="text-cyan-400">
                        <Icons.Binary />
                    </div>
                    <h3 className="font-semibold text-slate-200">Hex Dump</h3>
                </div>
                <button
                    className="text-xs px-3 py-1 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={async () => {
                        if (!onDownloadAll) return;
                        try {
                            setIsDownloading(true);
                            await onDownloadAll();
                        } catch (e) {
                            alert('Error downloading hex dump: ' + e.message);
                        } finally {
                            setIsDownloading(false);
                        }
                    }}
                    disabled={!onDownloadAll || isDownloading}
                    title={onDownloadAll ? '' : 'Reload file to enable download'}
                >
                    {isDownloading ? 'Preparing...' : 'Download full dump'}
                </button>
            </div>
            <div className="p-4 bg-slate-950 overflow-auto font-mono text-sm flex flex-col items-center max-h-[48rem]">
                <div className="grid grid-cols-[min-content_1fr_min-content] gap-4 w-fit">
                    {rows.map((r, i) => (
                        <React.Fragment key={i}>
                            <div className="text-cyan-600/70 select-none">{r.offset}</div>
                            <div className="text-slate-300 whitespace-pre">{r.hex}</div>
                            <div className="text-slate-400 whitespace-pre tracking-widest">
                                {r.ascii}
                            </div>
                        </React.Fragment>
                    ))}
                </div>
                {totalSize && totalSize > data.length && (
                    <div className="text-[10px] text-slate-500 mt-3 self-start">
                        Showing first {data.length} bytes of {totalSize}. Download full dump to view
                        everything.
                    </div>
                )}
            </div>
        </div>
    );
};
