/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ios: {
          blue: '#0A84FF',
          blueDark: '#0070DF',
          bg: '#000000',
          bgAlt: '#0A0A0A',
          gray6: '#1C1C1E',
          gray5: '#2C2C2E',
          gray4: '#3A3A3C',
          label: '#F2F2F7',
          secondary: '#8E8E93',
        },
        chat: {
          bg: '#000000',
          sidebar: '#000000',
          header: '#1C1C1E',
          card: '#1C1C1E',
          surface: '#1C1C1E',
          surfaceElevated: '#2C2C2E',
          input: '#1C1C1E',
          border: 'rgba(255, 255, 255, 0.08)',
          hover: '#2C2C2E',
          sent: '#0A84FF',
          sentEnd: '#0070DF',
          received: '#1C1C1E',
          muted: '#8E8E93',
          icon: '#8E8E93',
          accent: '#0A84FF',
        },
      },
      borderRadius: {
        'xs': '2px',
        '2xl': '16px',
        '3xl': '20px',
        'ios-bubble': '18px',
      },
    },
  },
  plugins: [],
};
