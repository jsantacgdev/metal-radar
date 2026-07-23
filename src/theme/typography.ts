import { colors } from './colors';

export const fontFamily = {
  display: 'Archivo_800ExtraBold',
  displayBold: 'Archivo_700Bold',
  body: 'HankenGrotesk_400Regular',
  bodyMedium: 'HankenGrotesk_500Medium',
  bodyBold: 'HankenGrotesk_700Bold',
  mono: 'SpaceMono_400Regular',
  monoBold: 'SpaceMono_700Bold',
} as const;

export const textStyles = {
  displayXL: {
    fontFamily: fontFamily.display,
    fontSize: 44,
    lineHeight: 41,
    letterSpacing: -1,
    // textTransform: 'uppercase' as const,
    color: colors.bright,
  },
  displayLG: {
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 32,
    letterSpacing: -0.7,
    // textTransform: 'uppercase' as const,
    color: colors.bright,
  },
  displayMD: {
    fontFamily: fontFamily.displayBold,
    fontSize: 22,
    lineHeight: 24,
    letterSpacing: -0.4,
    // textTransform: 'uppercase' as const,
    color: colors.bright,
  },
  displaySM: {
    fontFamily: fontFamily.displayBold,
    fontSize: 17,
    lineHeight: 20,
    letterSpacing: -0.2,
    color: colors.bright,
  },

  bodyLG: {
    fontFamily: fontFamily.body,
    fontSize: 16,
    lineHeight: 22,
    color: colors.bright,
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.silver,
  },
  bodySM: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.silver,
  },

  monoLG: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    color: colors.muted,
  },
  monoMD: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: colors.muted,
  },
  monoSM: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    color: colors.muted,
  },
} as const;

export type TextVariant = keyof typeof textStyles;
