export const HashBox = ({ label, value, className = '' }) => (
    <div className={`bg-slate-900/50 p-3 rounded border border-slate-700/50 ${className}`}>
        <span className="text-xs text-slate-500 uppercase font-bold block mb-1">{label}</span>
        <code className="text-xs text-cyan-200 break-all select-all font-mono">
            {value || 'Calculating...'}
        </code>
    </div>
);
