import React from 'react';
import { Icons } from './Icons';

export const StringsSection = ({ strings, fileName: _fileName, onDownloadAll }) => {
    const [isDownloading, setIsDownloading] = React.useState(false);
    if (!strings || !strings.length) return null;
    const isTruncated = strings.length >= 1000;

    const handleDownload = async () => {
        if (!onDownloadAll) return;
        try {
            setIsDownloading(true);
            await onDownloadAll();
        } catch (e) {
            alert('Error downloading strings: ' + e.message);
        } finally {
            setIsDownloading(false);
        }
    };
    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="bg-slate-900/50 px-6 py-3 border-b border-slate-700 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <div className="text-cyan-400">
                        <Icons.FileText />
                    </div>
                    <h3 className="font-semibold text-slate-200">Strings</h3>
                </div>
                <button
                    className="text-xs px-3 py-1 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleDownload}
                    disabled={!onDownloadAll || isDownloading}
                    title={onDownloadAll ? '' : 'Reload file to enable download'}
                >
                    {isDownloading ? 'Preparing...' : 'Download all'}
                </button>
            </div>
            <div className="p-4 bg-slate-950 max-h-96 overflow-y-auto font-mono text-xs text-slate-200 space-y-1">
                {strings.map((s, i) => (
                    <div key={i} className="whitespace-pre-wrap break-words">
                        {s}
                    </div>
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
