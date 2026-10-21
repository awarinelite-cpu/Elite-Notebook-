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

// Same hue family as dark, but the default card drops to true black and
// every tint gets a touch darker/desaturated so nothing reads as a washed-
// out gray rectangle against a pure-black page.
export const NOTE_COLORS_OLED = {
  default: '#000000',
  coral: '#431F1D',
  peach: '#392913',
  sand: '#37331A',
  sage: '#26331C',
  fog: '#10322C',
  storm: '#172B44',
  dusk: '#2B2036',
  blossom: '#391D2A',
  clay: '#2D271D',
}

// Kept for any code that hasn't switched to getNoteColors(theme) yet.
export const NOTE_COLORS = NOTE_COLORS_LIGHT

export function getNoteColors(theme) {
  if (theme === 'oled') return NOTE_COLORS_OLED
  if (theme === 'dark') return NOTE_COLORS_DARK
  return NOTE_COLORS_LIGHT
}

// Helpers for the scenic wallpapers below — still pure CSS (no image assets).
const STARS = `radial-gradient(circle at 12% 18%, rgba(255,255,255,0.95) 0 1.4px, transparent 1.5px),
  radial-gradient(circle at 34% 8%, rgba(255,255,255,0.8) 0 1px, transparent 1.1px),
  radial-gradient(circle at 58% 24%, rgba(255,255,255,0.85) 0 1.3px, transparent 1.4px),
  radial-gradient(circle at 88% 12%, rgba(255,255,255,0.9) 0 1.2px, transparent 1.3px),
  radial-gradient(circle at 76% 40%, rgba(255,255,255,0.6) 0 1px, transparent 1.1px),
  radial-gradient(circle at 22% 46%, rgba(255,255,255,0.7) 0 1px, transparent 1.1px)`

// A row of skyscrapers: [left%, width%, height%] each, drawn as flat blocks
// anchored to the bottom, with optional lit-window stripes and roof spires.
function skyline(buildings, body, windows) {
  const pos = (l, w) => (w >= 100 ? 0 : (l * 100) / (100 - w))
  const layers = []
  for (const [l, w, h] of buildings) {
    if (windows) layers.push(`repeating-linear-gradient(0deg, ${windows} 0 1.6px, transparent 1.6px 6px) ${pos(l, w)}% 100% / ${w}% ${h}% no-repeat`)
    if (h >= 45) layers.push(`linear-gradient(${body}, ${body}) ${pos(l + w / 2 - 0.4, 0.8)}% 100% / 0.8% ${h + 7}% no-repeat`)
  }
  for (const [l, w, h] of buildings) layers.push(`linear-gradient(${body}, ${body}) ${pos(l, w)}% 100% / ${w}% ${h}% no-repeat`)
  return layers.join(',\n  ')
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
  bloom: `radial-gradient(circle at 32% 22%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.15) 42%, transparent 60%),
          linear-gradient(160deg, #F5F3EA 0%, #D9D4C2 35%, #6B6F5E 70%, #34362C 100%)`,
  meadow: 'linear-gradient(150deg, #E4F5C0 0%, #9BCB6C 40%, #4F8A4B 75%, #2C5530 100%)',
  seaglass: 'linear-gradient(160deg, #D3F1F5 0%, #7FCFDB 40%, #2E93A6 70%, #0C5866 100%)',
  horizon: 'linear-gradient(180deg, #FFE1A8 0%, #FF9F76 28%, #6FB8D9 62%, #1C4E6E 85%, #0D2A3D 100%)',
  starfield: `radial-gradient(circle at 18% 22%, rgba(255,255,255,0.95) 0 1.4px, transparent 1.5px),
              radial-gradient(circle at 62% 12%, rgba(255,255,255,0.8) 0 1px, transparent 1.1px),
              radial-gradient(circle at 80% 52%, rgba(255,255,255,0.7) 0 1.2px, transparent 1.3px),
              radial-gradient(circle at 35% 68%, rgba(255,255,255,0.85) 0 1.3px, transparent 1.4px),
              radial-gradient(circle at 50% 38%, rgba(255,255,255,0.6) 0 1px, transparent 1.1px),
              radial-gradient(circle at 10% 82%, rgba(255,255,255,0.75) 0 1.1px, transparent 1.2px),
              radial-gradient(circle at 90% 85%, rgba(255,255,255,0.55) 0 1px, transparent 1.1px),
              linear-gradient(170deg, #040914 0%, #0B1C3D 45%, #123E5E 100%)`,
  savanna: 'linear-gradient(160deg, #FDEBA8 0%, #F2A65A 42%, #B5651D 75%, #4E3524 100%)',
  // --- Earth & space ---
  earth: `radial-gradient(ellipse 22% 7% at 36% 76%, rgba(80,185,100,0.85) 0 70%, transparent 100%),
          radial-gradient(ellipse 16% 6% at 66% 70%, rgba(80,185,100,0.7) 0 70%, transparent 100%),
          radial-gradient(ellipse 140% 55% at 50% 112%, #0B3A80 0%, #1E6BD0 70%, #5FB4FF 93%, #CFEAFF 97%, transparent 100%),
          ${STARS},
          linear-gradient(180deg, #01030A 0%, #06122B 100%)`,
  earthrise: `radial-gradient(circle 52px at 74% 24%, #1E6BD0 0 80%, #7CC4FF 94%, rgba(124,196,255,0) 100%),
              radial-gradient(circle 110px at 74% 24%, rgba(100,180,255,0.25) 0%, transparent 100%),
              radial-gradient(ellipse 170% 26% at 40% 128%, #9A9AA2 0 66%, #5A5A62 96%, transparent 100%),
              ${STARS},
              linear-gradient(180deg, #000000 0%, #0A0F1E 100%)`,

  // --- Sea & ocean ---
  deepocean: `repeating-linear-gradient(105deg, rgba(255,255,255,0.08) 0 14px, transparent 14px 46px) 0 0 / 100% 50% no-repeat,
              radial-gradient(circle at 30% 62%, rgba(255,255,255,0.35) 0 3px, transparent 4px),
              radial-gradient(circle at 34% 54%, rgba(255,255,255,0.25) 0 2px, transparent 3px),
              radial-gradient(circle at 72% 78%, rgba(255,255,255,0.3) 0 4px, transparent 5px),
              linear-gradient(180deg, #1B9BD8 0%, #0A5C9E 30%, #06305E 65%, #020E22 100%)`,
  waves: `radial-gradient(ellipse 55% 8% at 22% 70%, rgba(255,255,255,0.3) 0 70%, transparent 72%),
          radial-gradient(ellipse 60% 8% at 76% 80%, rgba(255,255,255,0.24) 0 70%, transparent 72%),
          radial-gradient(ellipse 50% 7% at 38% 91%, rgba(255,255,255,0.2) 0 70%, transparent 72%),
          linear-gradient(180deg, #A5ECF5 0%, #23A9DA 35%, #0B63A5 70%, #06305E 100%)`,
  lagoon: 'linear-gradient(170deg, #E8FFF7 0%, #8FF0D8 25%, #35C7C0 55%, #1388B0 85%, #0A4F80 100%)',
  sunsetsea: `radial-gradient(circle 64px at 50% 56%, #FFF6D5 0 40%, rgba(255,190,110,0.6) 72%, transparent 100%),
              linear-gradient(90deg, transparent 43%, rgba(255,214,150,0.5) 50%, transparent 57%) 0 100% / 100% 44% no-repeat,
              linear-gradient(180deg, #2B1B5A 0%, #C2477E 33%, #FF9966 54%, #1B5C8A 56%, #0B2E52 100%)`,
  beach: 'linear-gradient(180deg, #BFE6FF 0%, #E6F6FF 30%, #5CC8D8 40%, #2FA6C4 55%, #F6EBC3 63%, #E8CF93 100%)',
  stormsea: `repeating-linear-gradient(8deg, rgba(255,255,255,0.1) 0 3px, transparent 3px 18px) 0 62% / 100% 38% no-repeat,
             linear-gradient(180deg, #3A4558 0%, #5B6B80 38%, #2F4A5F 40%, #1B3144 70%, #0B1A2A 100%)`,

  // --- Landscapes ---
  alpine: `radial-gradient(ellipse 130% 20% at 30% 110%, #3F7D3A 0 98%, transparent 100%),
           conic-gradient(from 135deg at 50% 0%, #4C5D85 0 90deg, transparent 90deg) 10px 100% / 120px 60px repeat-x,
           conic-gradient(from 135deg at 50% 0%, #8FA3C9 0 90deg, transparent 90deg) 50px 100% / 190px 95px repeat-x,
           linear-gradient(180deg, #7EC8F7 0%, #CBEBFF 55%, #F5E9D0 100%)`,
  hills: `radial-gradient(ellipse 120% 22% at 15% 108%, #2E6B34 0 98%, transparent 100%),
          radial-gradient(ellipse 100% 24% at 90% 102%, #4C9A4A 0 98%, transparent 100%),
          radial-gradient(ellipse 140% 26% at 50% 88%, #8CC768 0 98%, transparent 100%),
          radial-gradient(circle at 78% 18%, rgba(255,250,215,0.95) 0 22px, rgba(255,240,170,0.35) 60px, transparent 120px),
          linear-gradient(180deg, #8ED1F5 0%, #D8F1FF 65%, #F3F9E3 100%)`,
  dunes: `radial-gradient(ellipse 90% 24% at 8% 108%, #A94A1B 0 98%, transparent 100%),
          radial-gradient(ellipse 80% 22% at 88% 102%, #D9772F 0 98%, transparent 100%),
          radial-gradient(ellipse 110% 26% at 45% 84%, #EFA45A 0 98%, transparent 100%),
          linear-gradient(180deg, #FFE3B3 0%, #FFC98A 40%, #F29B5B 100%)`,
  polarnight: `linear-gradient(110deg, transparent 15%, rgba(0,255,170,0.38) 38%, rgba(120,90,255,0.32) 62%, transparent 85%) 0 0 / 100% 62% no-repeat,
               radial-gradient(ellipse 130% 16% at 50% 112%, #E8F2FF 0 98%, transparent 100%),
               conic-gradient(from 135deg at 50% 0%, #0A1224 0 90deg, transparent 90deg) 0 100% / 150px 75px repeat-x,
               ${STARS},
               linear-gradient(180deg, #020813 0%, #08233A 60%, #0B2B3F 100%)`,
  autumnvalley: `radial-gradient(ellipse 120% 22% at 20% 108%, #8A3B12 0 98%, transparent 100%),
                 radial-gradient(ellipse 100% 24% at 85% 104%, #C8571A 0 98%, transparent 100%),
                 conic-gradient(from 135deg at 50% 0%, #7B5A8C 0 90deg, transparent 90deg) 20px 100% / 160px 80px repeat-x,
                 linear-gradient(180deg, #FFE8C2 0%, #F9C88C 50%, #F7A56A 100%)`,

  // --- Skyscrapers ---
  skyline: `${skyline([[2,10,34],[14,8,48],[30,9,30],[58,8,40],[74,10,32],[88,9,44]], '#6B5B9A')},
  ${skyline([[0,11,52],[10,8,40],[19,10,64],[32,7,46],[41,11,72],[53,8,50],[62,10,60],[73,8,44],[82,9,68],[92,8,48]], '#1E1B3F')},
  linear-gradient(180deg, #FFB88C 0%, #F6A5C0 35%, #8E7CC3 70%, #3B3A7A 100%)`,
  citynight: `${skyline([[0,11,52],[10,8,40],[19,10,64],[32,7,46],[41,11,72],[53,8,50],[62,10,60],[73,8,44],[82,9,68],[92,8,48]], '#0A1128', 'rgba(255,214,120,0.55)')},
  ${skyline([[4,9,36],[16,8,50],[34,9,34],[56,8,44],[70,10,38],[86,9,48]], '#16224A')},
  ${STARS},
  linear-gradient(180deg, #050A1A 0%, #0F1D45 70%, #1B2F66 100%)`,
  metropolis: `${skyline([[0,11,58],[11,8,44],[20,10,70],[33,7,50],[42,11,78],[54,8,54],[63,10,64],[74,8,48],[83,9,72],[93,8,52]], '#274E78', 'rgba(190,225,255,0.35)')},
  ${skyline([[5,9,40],[17,8,54],[35,9,38],[57,8,48],[71,10,42],[87,9,52]], '#8FB6DA')},
  linear-gradient(180deg, #5FAEEF 0%, #A9D8F8 55%, #E4F4FF 100%)`,
  neoncity: `${skyline([[0,11,52],[10,8,40],[19,10,64],[32,7,46],[41,11,72],[53,8,50],[62,10,60],[73,8,44],[82,9,68],[92,8,48]], '#120B2E', 'rgba(0,229,255,0.55)')},
  ${skyline([[4,9,38],[16,8,52],[34,9,36],[56,8,46],[70,10,40],[86,9,50]], '#2A1B5E')},
  linear-gradient(180deg, #0F0C29 0%, #302B63 50%, #B8337A 100%)`,
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
  bloom: 'Bloom',
  meadow: 'Meadow',
  seaglass: 'Sea glass',
  horizon: 'Horizon',
  starfield: 'Starfield',
  savanna: 'Savanna',
  earth: 'Earth from space',
  earthrise: 'Earthrise',
  deepocean: 'Deep ocean',
  waves: 'Waves',
  lagoon: 'Lagoon',
  sunsetsea: 'Sunset sea',
  beach: 'Beach',
  stormsea: 'Stormy sea',
  alpine: 'Alpine peaks',
  hills: 'Green hills',
  dunes: 'Desert dunes',
  polarnight: 'Polar night',
  autumnvalley: 'Autumn valley',
  skyline: 'Skyline dusk',
  citynight: 'City at night',
  metropolis: 'Metropolis',
  neoncity: 'Neon city',
}
