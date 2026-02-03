import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        mist: '#f8fafc',
        ember: '#f97316',
        tide: '#38bdf8'
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(15, 23, 42, 0.08), 0 18px 35px rgba(15, 23, 42, 0.08)'
      }
    }
  },
  plugins: []
};

export default config;
