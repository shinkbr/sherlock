import { Icons } from './Icons';

export const ArchiveSection = ({ files }) => {
    if (!files || !files.length) return null;
    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="bg-slate-900/50 px-6 py-3 border-b border-slate-700 flex items-center gap-2">
                <div className="text-cyan-400">
                    <Icons.FolderOpen />
                </div>
                <h3 className="font-semibold text-slate-200">Archive Contents</h3>
            </div>
            <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-left text-sm text-slate-400">
                    <thead className="bg-slate-950 text-slate-500 font-medium sticky top-0">
                        <tr>
                            <th className="px-6 py-3">File Name</th>
                            <th className="px-6 py-3 text-right">Size</th>
                            <th className="px-6 py-3 text-right">CRC32</th>
                            <th className="px-6 py-3 text-right">Enc</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50 font-mono text-xs">
                        {files.map((f, i) => (
                            <tr key={i} className="hover:bg-slate-700/30">
                                <td
                                    className="px-6 py-2 text-slate-300 truncate max-w-xs"
                                    title={f.name}
                                >
                                    {f.name}
                                </td>
                                <td className="px-6 py-2 text-right">{f.size}</td>
                                <td className="px-6 py-2 text-right text-cyan-600">
                                    {f.crc || 'N/A'}
                                </td>
                                <td className="px-6 py-2 text-right">{f.encrypted ? '🔒' : ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
