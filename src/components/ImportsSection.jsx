import { Icons } from './Icons';

export const ImportsSection = ({ imports }) => {
    if (!imports || !Object.keys(imports).length) return null;
    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="bg-slate-900/50 px-6 py-3 border-b border-slate-700 flex items-center gap-2">
                <div className="text-cyan-400">
                    <Icons.Layers />
                </div>
                <h3 className="font-semibold text-slate-200">Imports</h3>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                {Object.entries(imports).map(([dll, funcs], i) => (
                    <div key={i} className="bg-slate-900/50 border border-slate-700 rounded p-3">
                        <h4 className="text-sm font-bold text-slate-200 mb-2 text-cyan-400">
                            {dll}
                        </h4>
                        <div className="text-[10px] text-slate-400 font-mono space-y-1">
                            {funcs.map((f, j) => (
                                <div key={j} className="truncate" title={f}>
                                    • {f}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
