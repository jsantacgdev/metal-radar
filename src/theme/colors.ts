export const colors = {
  ink: '#0a0a0c',
  ink2: '#101013',
  panel: '#141418',
  panel2: '#1b1b20',
  panel3: '#222228',

  line: 'rgba(255,255,255,0.08)',
  lineSoft: 'rgba(255,255,255,0.05)',

  bright: '#edeff2',
  silver: '#c7cad0',
  muted: '#82858d',
  faint: '#5a5d64',

  onAccent: '#fff',

  blood: '#cf2e24',
  bloodBright: '#e63c2e',
  bloodDeep: '#7d1a14',

  bloodTint: 'rgba(207,46,36,0.1)',
  bloodTintBorder: 'rgba(207,46,36,0.3)',
} as const;

export type ColorKey = keyof typeof colors;
