import { Icons } from './Icons';

export const MapViewer = ({ gps }) => {
    if (!gps) return null;
    return (
        <div className="mt-4 rounded-lg overflow-hidden border border-slate-700 bg-slate-900 relative h-64">
            <iframe
                width="100%"
                height="100%"
                frameBorder="0"
                scrolling="no"
                style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg) brightness(95%)' }}
                src={`https://www.google.com/maps?q=${gps.lat},${gps.lon}&z=14&output=embed`}
            ></iframe>
            <a
                href={`https://www.google.com/maps?q=${gps.lat},${gps.lon}`}
                target="_blank"
                className="absolute bottom-2 right-2 bg-slate-900/80 text-xs px-2 py-1 rounded text-white backdrop-blur flex items-center gap-1 hover:text-cyan-400"
            >
                Open External <Icons.MapPin />
            </a>
        </div>
    );
};
