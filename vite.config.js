import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    base: '/sherlock/',
    plugins: [
        react(),
        tailwindcss(),
        VitePWA({
            registerType: 'autoUpdate',
            manifest: {
                name: 'Sherlock',
                short_name: 'Sherlock',
                description: 'Analyze files in your browser',
                theme_color: '#0f172a',
                icons: [
                    {
                        src: 'favicon.svg',
                        sizes: 'any 512x512',
                        type: 'image/svg+xml',
                        purpose: 'any maskable'
                    }
                ]
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,gif,webp,wasm}']
            }
        })
    ],
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: true
    }
});
