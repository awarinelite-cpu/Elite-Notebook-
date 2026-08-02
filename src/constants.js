export const NOTE_COLORS_LIGHT = {
  default: '#FFFFFF',
  coral: '#F5C6C0',
  peach: '#F2DCB0',
  sand: '#EFE6C4',
  sage: '#D7E4C6',
  fog: '#CFE8E3',
  storm: '#CDE1F8',
  dusk: '#E4D1F0',
  blossom: '#F6D4E3',
  clay: '#E8DCC8',
}

export const NOTE_COLORS_DARK = {
  default: '#26272B',
  coral: '#5C2B29',
  peach: '#4D3818',
  sand: '#4A4423',
  sage: '#334425',
  fog: '#16433C',
  storm: '#1F3A5C',
  dusk: '#3B2C4A',
  blossom: '#4B2738',
  clay: '#3D3527',
}

// Kept for any code that hasn't switched to getNoteColors(theme) yet.
export const NOTE_COLORS = NOTE_COLORS_LIGHT

export function getNoteColors(theme) {
  return theme === 'dark' ? NOTE_COLORS_DARK : NOTE_COLORS_LIGHT
}

// Wallpaper backgrounds — an alternative to flat colors. Pure CSS
// gradients/patterns (no image assets), so they're crisp at any size,
// theme-safe, and don't need network or storage. When a note has a
// background set, it takes precedence over `color` for display.
export const NOTE_BACKGROUNDS = {
  sunset: 'linear-gradient(135deg, #FF9A76 0%, #FF6B9D 55%, #A55EEA 100%)',
  ocean: 'linear-gradient(135deg, #0093E9 0%, #80D0C7 100%)',
  aurora: 'linear-gradient(120deg, #00F5A0 0%, #00D9F5 100%)',
  lavender: 'linear-gradient(135deg, #A18CD1 0%, #FBC2EB 100%)',
  citrus: 'linear-gradient(135deg, #FDC830 0%, #F37335 100%)',
  mint: 'linear-gradient(135deg, #A8FF78 0%, #78FFD6 100%)',
  berry: 'linear-gradient(135deg, #F857A6 0%, #FF5858 100%)',
  dusk: 'linear-gradient(135deg, #654EA3 0%, #EAAFC8 100%)',
  night: `radial-gradient(circle at 15% 20%, rgba(255,255,255,0.9) 0 1.5px, transparent 1.6px),
          radial-gradient(circle at 70% 60%, rgba(255,255,255,0.7) 0 1px, transparent 1.1px),
          radial-gradient(circle at 40% 80%, rgba(255,255,255,0.8) 0 1.2px, transparent 1.3px),
          radial-gradient(circle at 85% 15%, rgba(255,255,255,0.6) 0 1px, transparent 1.1px),
          radial-gradient(circle at 55% 35%, rgba(255,255,255,0.85) 0 1.4px, transparent 1.5px),
          linear-gradient(160deg, #0F2027 0%, #203A43 50%, #2C5364 100%)`,
  bubbles: `radial-gradient(circle at 20% 30%, rgba(255,255,255,0.55) 0 10px, transparent 11px),
            radial-gradient(circle at 70% 20%, rgba(255,255,255,0.4) 0 6px, transparent 7px),
            radial-gradient(circle at 45% 65%, rgba(255,255,255,0.5) 0 14px, transparent 15px),
            radial-gradient(circle at 85% 75%, rgba(255,255,255,0.35) 0 8px, transparent 9px),
            radial-gradient(circle at 15% 85%, rgba(255,255,255,0.45) 0 9px, transparent 10px),
            linear-gradient(135deg, #4FACFE 0%, #00F2FE 100%)`,
}

export const NOTE_BACKGROUND_LABELS = {
  sunset: 'Sunset',
  ocean: 'Ocean',
  aurora: 'Aurora',
  lavender: 'Lavender',
  citrus: 'Citrus',
  mint: 'Mint',
  berry: 'Berry',
  dusk: 'Dusk',
  night: 'Night sky',
  bubbles: 'Bubbles',
}
