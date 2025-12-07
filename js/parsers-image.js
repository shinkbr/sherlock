
import exifr from 'exifr';

export async function parseImage(buffer) {
    const metadata = {};
    let gps = null;
    try {
        // console.log('exifr:', exifr); // Debug exifr import

        const ex = await exifr.parse(buffer, {
            tiff: true,
            xmp: true,
            icc: true,
            gps: true
        });
        if (ex) {
            for (const [k, v] of Object.entries(ex)) {
                if (v instanceof Uint8Array || (typeof v === 'object' && !(v instanceof Date)))
                    continue;
                metadata[k] = v instanceof Date ? v.toLocaleString() : v;
            }
            if (ex.latitude && ex.longitude) gps = { lat: ex.latitude, lon: ex.longitude };
        }
    } catch {
        /* ignore */
    }
    return { metadata, gps };
}
