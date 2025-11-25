(() => {
    async function parseVideo(file) {
        let meta = {};
        try {
            const video = document.createElement('video');
            video.preload = 'metadata';
            const domMeta = await new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    resolve({ "Duration": `${Math.floor(video.duration / 60)}m ${Math.floor(video.duration % 60)}s`, "Res": `${video.videoWidth}x${video.videoHeight}` });
                };
                video.onerror = () => resolve({});
                video.src = URL.createObjectURL(file);
            });
            meta = domMeta;
        } catch (e) { }
        return meta;
    }

    window.Parsers = Object.assign(window.Parsers || {}, {
        parseVideo
    });
})();
