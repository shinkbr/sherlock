import { Icons } from './Icons';

export const MetadataSection = ({ title, data, children, icon }) => {
    const Icon = Icons[icon];
    if ((!data || Object.keys(data).length === 0) && !children) return null;
    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="bg-slate-900/50 px-6 py-3 border-b border-slate-700 flex items-center gap-2">
                {Icon && (
                    <div className="text-cyan-400">
                        <Icon />
                    </div>
                )}
                <h3 className="font-semibold text-slate-200">{title}</h3>
            </div>
            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                    {data &&
                        Object.entries(data).map(([k, v]) => (
                            <div key={k}>
                                <span className="text-xs text-slate-500 uppercase font-bold block mb-1">
                                    {k}
                                </span>
                                <span className="text-sm text-slate-200 font-mono break-words whitespace-pre-wrap">
                                    {v}
                                </span>
                            </div>
                        ))}
                </div>
                {children}
            </div>
        </div>
    );
};
