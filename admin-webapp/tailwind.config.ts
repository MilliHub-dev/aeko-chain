import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0d0e16',
        card: '#12141f',
        border: '#1e2135',
        muted: '#6b7280',
      },
    },
  },
  plugins: [],
}
export default config
