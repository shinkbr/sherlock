import { HashBox } from './HashBox';

export const InfoCard = ({ data }) => (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 shadow-lg">
        <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
            <div>
                <h2 className="text-2xl font-bold text-white mb-1">{data.name}</h2>
                <div className="flex gap-3 text-sm text-slate-400 font-mono">
                    <span>{data.size}</span>
                    <span>|</span>
                    <span>{data.type || 'Unknown Type'}</span>
                </div>
            </div>
            <div className="text-right">
                <div className="px-3 py-1 bg-cyan-500/10 text-cyan-400 text-xs font-bold rounded border border-cyan-500/20 inline-block mb-1">
                    {data.detectedFormat}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                    Magic: {data.magic.substring(0, 16)}...
                </div>
            </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HashBox label="SHA-256" value={data.hashes.sha256} />
            <HashBox label="SHA-1" value={data.hashes.sha1} />
            <HashBox label="MD5" value={data.hashes.md5} />
            <HashBox label="CRC32" value={data.hashes.crc32} />

            <div className="bg-slate-900/50 p-3 rounded border border-slate-700/50 md:col-span-2">
                <div className="flex justify-between mb-2 text-xs font-bold text-slate-500 uppercase">
                    <span>Entropy</span>
                    <span className="font-mono text-cyan-200">{data.entropy.value.toFixed(3)}</span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-2">
                    <div
                        className={`h-2 rounded-full ${data.entropy.value > 7.2 ? 'bg-red-500' : 'bg-cyan-500'}`}
                        style={{ width: `${data.entropy.percentage}%` }}
                    ></div>
                </div>
            </div>
        </div>
    </div>
);
