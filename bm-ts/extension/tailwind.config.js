module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}', './popup.html'],
  theme: {
    extend: {
      fontFamily: {
        inter: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif',
        ],
      },
      colors: {
        blueBrand: '#0080A6',
        blueStrong: '#2A7FA0',
        orangeBrand: '#E56717',
        orangeStrong: '#CA4F02',
        textPrimary: '#574232',
        textMuted: '#6E5A49',
        surfaceCanvas: '#F7F7F7',
        surfaceSection: '#FEF7F0',
        surfaceCard: '#FFFFFF',
        stateError: '#DC2626',
      },
    },
  },
  plugins: [],
};
