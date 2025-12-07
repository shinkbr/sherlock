import React from 'react';
import { Icons } from './Icons';

export const DropZone = ({ onFileSelect, isAnalyzing }) => {
    const [isDragging, setIsDragging] = React.useState(false);

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files.length) onFileSelect(e.dataTransfer.files[0]);
    };

    return (
        <div
            className={`drop-zone relative h-64 flex flex-col items-center justify-center cursor-pointer rounded-2xl mb-8 border-2 border-dashed transition-all ${isDragging ? 'active border-cyan-400' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'}`}
            onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('fileInput').click()}
        >
            <input
                type="file"
                id="fileInput"
                className="hidden"
                onChange={(e) => e.target.files.length && onFileSelect(e.target.files[0])}
            />

            {isAnalyzing ? (
                <div className="text-center">
                    <div className="inline-block w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mb-4"></div>
                    <p className="text-slate-400 animate-pulse font-mono">Analyzing binary...</p>
                </div>
            ) : (
                <div className="text-center">
                    <div className="inline-block p-4 rounded-full bg-slate-800 mb-4 text-cyan-400">
                        <Icons.Upload />
                    </div>
                    <p className="text-lg font-medium text-slate-200">
                        Drag & Drop or <span className="text-cyan-400">Browse</span>
                    </p>
                    <p className="text-sm text-slate-500 mt-2">
                        Supports Docs, Images, Videos, Archives, Executables, etc.
                    </p>
                    <p className="text-sm text-slate-500">
                        Files are processed in-browser and never uploaded anywhere.
                    </p>
                </div>
            )}
        </div>
    );
};
