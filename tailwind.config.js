/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    screens: {
      'xs': '400px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    extend: {
      // Dungeon color palette
      colors: {
        // Stone/dungeon grays
        stone: {
          50: '#f5f3f0',
          100: '#e8e4dd',
          200: '#d1c9bc',
          300: '#b5a892',
          400: '#9a8a6e',
          500: '#7d6c52',
          600: '#5a4a35',
          700: '#3d3224',
          800: '#2a2118',
          850: '#1f1810',
          900: '#15100a',
          950: '#0a0805',
        },
        // Parchment/scroll colors
        parchment: {
          50: '#fefcf7',
          100: '#fdf8eb',
          200: '#f9efd6',
          300: '#f2e0b5',
          400: '#e8cc8a',
          500: '#d4a55a',
          600: '#b8863d',
          700: '#8f6530',
          800: '#6b4a24',
          900: '#4a3318',
        },
        // Blood/crimson for enemies/danger
        blood: {
          50: '#fdf2f2',
          100: '#fce7e7',
          200: '#f9d0d0',
          300: '#f4a8a8',
          400: '#ec7272',
          500: '#dc4343',
          600: '#c12525',
          700: '#9e1b1b',
          800: '#841919',
          900: '#6b1010',
          950: '#3a0707',
        },
        // Copper/gold for heroes
        copper: {
          50: '#fdf8f3',
          100: '#faeee2',
          200: '#f4d9c0',
          300: '#ebc097',
          400: '#d4a574',
          500: '#c4915c',
          600: '#a97545',
          700: '#8c5c37',
          800: '#724a30',
          900: '#5e3d29',
        },
        // Moss green for nature/healing
        moss: {
          50: '#f4f7f4',
          100: '#e4ede4',
          200: '#c9dac9',
          300: '#a3bda3',
          400: '#789c78',
          500: '#556b2f',
          600: '#4a5d28',
          700: '#3d4d21',
          800: '#313e1b',
          900: '#283216',
        },
        // Arcane purple for magic
        arcane: {
          50: '#f8f6fc',
          100: '#f0ebf8',
          200: '#e0d5f1',
          300: '#c9b5e6',
          400: '#a98ad6',
          500: '#8a5fc4',
          600: '#7040a9',
          700: '#5c338b',
          800: '#4a2a71',
          900: '#3d245c',
        },
        // Rust/orange for warnings
        rust: {
          50: '#fdf6f3',
          100: '#fbebe3',
          200: '#f7d6c7',
          300: '#f0b8a0',
          400: '#e68f6d',
          500: '#d66b44',
          600: '#c14f2d',
          700: '#a13d24',
          800: '#843423',
          900: '#6c2e21',
        },
        // Mystic teal for enchantments
        mystic: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
      },
      // Dungeon-themed fonts
      fontFamily: {
        pixel: ['"Press Start 2P"', 'cursive'],
        medieval: ['"Almendra"', 'serif'],
        dungeon: ['"Almendra"', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      // Custom shadows for dungeon effects
      boxShadow: {
        'inner-dark': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.5)',
        'dungeon': '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
        'torch': '0 0 15px 3px rgba(212, 165, 116, 0.3), 0 0 30px 6px rgba(212, 165, 116, 0.15)',
        'torch-hover': '0 0 20px 5px rgba(212, 165, 116, 0.4), 0 0 40px 10px rgba(212, 165, 116, 0.2)',
        'blood-glow': '0 0 10px 2px rgba(193, 37, 37, 0.3)',
        'arcane-glow': '0 0 10px 2px rgba(138, 95, 196, 0.3)',
        'embossed': 'inset 1px 1px 0 rgba(255,255,255,0.1), inset -1px -1px 0 rgba(0,0,0,0.3)',
        'pressed': 'inset 2px 2px 4px rgba(0, 0, 0, 0.4), inset -1px -1px 2px rgba(255, 255, 255, 0.05)',
      },
      // Dungeon animations
      animation: {
        'flicker': 'flicker 3s ease-in-out infinite',
        'torch-glow': 'torch-glow 2s ease-in-out infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'fade-in-board': 'fade-in-board 0.6s ease-out forwards',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' },
          '75%': { opacity: '0.95' },
        },
        'torch-glow': {
          '0%, 100%': {
            boxShadow: '0 0 15px 3px rgba(212, 165, 116, 0.3), 0 0 30px 6px rgba(212, 165, 116, 0.15)',
          },
          '50%': {
            boxShadow: '0 0 20px 5px rgba(212, 165, 116, 0.4), 0 0 40px 10px rgba(212, 165, 116, 0.2)',
          },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        'fade-in-board': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      // Border radius for pixelated feel
      borderRadius: {
        'pixel': '2px',
        'pixel-md': '3px',
        'pixel-lg': '4px',
      },
      // Background images for textures (CSS patterns)
      backgroundImage: {
        'stone-texture': `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        'brick-texture': `url("data:image/svg+xml,%3Csvg width='42' height='44' viewBox='0 0 42 44' xmlns='http://www.w3.org/2000/svg'%3E%3Cg id='Page-1' fill='none' fill-rule='evenodd'%3E%3Cg id='brick-wall' fill='%23000000' fill-opacity='0.08'%3E%3Cpath d='M0 0h42v44H0V0zm1 1h40v20H1V1zM0 23h20v20H0V23zm22 0h20v20H22V23z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      },
    },
  },
  plugins: [],
}
