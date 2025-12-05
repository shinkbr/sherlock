/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './js/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace']
            },
            colors: {
                slate: {
                    850: '#1e293b',
                    900: '#0f172a',
                    950: '#020617'
                },
                cyan: {
                    400: '#22d3ee',
                    500: '#06b6d4'
                }
            }
        }
    },
    plugins: []
};
