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
        textPrimary: '#2A7FA0',
        textMuted: '#4FA5C6',
        surfaceCanvas: '#F7F7F7',
        surfaceSection: '#FEF7F0',
        surfaceCard: '#FFFFFF',
        stateError: '#DC2626',
      },
    },
  },
  plugins: [],
};
