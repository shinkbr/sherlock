import { Icons } from './Icons';

export const Header = () => (
    <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
                <div className="flex items-center gap-3">
                    <div className="text-cyan-400">
                        <Icons.Search />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-white">
                        Sherlock{' '}
                        <span className="text-slate-500 font-normal text-sm">| File Forensics</span>
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    <a
                        href="https://github.com/shinkbr/sherlock"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-cyan-400 transition-colors"
                    >
                        <Icons.Github />
                    </a>
                </div>
            </div>
        </div>
    </nav>
);
