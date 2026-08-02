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
