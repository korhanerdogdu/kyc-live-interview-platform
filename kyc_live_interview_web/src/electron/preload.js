const { contextBridge, desktopCapturer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getPrimaryDisplaySourceId: async () => {
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: 0, height: 0 },
        });
        const pick =
            sources.find(s => /Screen 1|Primary|Entire Screen/i.test(s.name)) ||
            sources[0];
        return pick?.id || null;
    },
});
