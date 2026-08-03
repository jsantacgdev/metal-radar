import { forwardRef, Fragment } from 'react';
import { StyleSheet, View, Text as RNText } from 'react-native';
import { PosterBand, PosterData } from '../hooks/usePosterData';
import { colors } from '../theme';

const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1920;

const FONT = {
  bebas: 'BebasNeue_400Regular',
  anton: 'Anton_400Regular',
  oswald: 'Oswald_400Regular',
  oswaldMedium: 'Oswald_500Medium',
  specialElite: 'SpecialElite_400Regular',
  unifraktur: 'UnifrakturMaguntia_400Regular',
  cinzel: 'Cinzel_400Regular',
  cinzelSemiBold: 'Cinzel_600SemiBold',
  cinzelBlack: 'Cinzel_900Black',
  metalLord: 'MetalLord',
};

type Props = {
  data: PosterData;
  userName?: string;
};

function BandsWithSeps({
  bands,
  textStyle,
  sepStyle,
}: {
  bands: PosterBand[];
  textStyle: any;
  sepStyle: any;
}) {
  return (
    <RNText style={textStyle}>
      {bands.map((b, i) => (
        <Fragment key={b.id}>
          {i > 0 && <RNText style={sepStyle}>{'\u00A0\u00A0·  '}</RNText>}
          <RNText>{b.name.toUpperCase()}</RNText>
        </Fragment>
      ))}
    </RNText>
  );
}

function TierDivider({ label }: { label: string }) {
  return (
    <View style={styles.tierDivider}>
      <View style={styles.tierDividerLine} />
      <RNText style={styles.tierDividerLabel}>{label}</RNText>
      <View style={styles.tierDividerLine} />
    </View>
  );
}

function HeadlinersGrid({ bands }: { bands: PosterBand[] }) {
  const row1 = bands.slice(0, 2);
  const row2 = bands.slice(2, 4);
  return (
    <View style={styles.tierHeadliners}>
      <View style={styles.headlinerRow}>
        {row1.map((b) => (
          <View key={b.id} style={styles.headlinerCell}>
            <RNText
              style={styles.headlinerText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {b.name.toUpperCase()}
            </RNText>
          </View>
        ))}
      </View>
      {row2.length > 0 && (
        <View style={styles.headlinerRow}>
          {row2.map((b) => (
            <View key={b.id} style={styles.headlinerCell}>
              <RNText
                style={styles.headlinerText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              >
                {b.name.toUpperCase()}
              </RNText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const FestivalPoster = forwardRef<View, Props>(({ data, userName }, ref) => {
  const displayUser = (userName || 'metalhead').toUpperCase();

  return (
    <View ref={ref} style={styles.poster} collapsable={false}>
      {/* Esquinas en L rojas */}
      <View style={[styles.corner, styles.cornerTL]} />
      <View style={[styles.corner, styles.cornerTR]} />
      <View style={[styles.corner, styles.cornerBL]} />
      <View style={[styles.corner, styles.cornerBR]} />

      <View style={styles.content}>
        {/* Header */}
        <RNText style={styles.brandStamp}>METAL RADAR · PRESENTS</RNText>

        <RNText
          style={styles.usernameLine}
          adjustsFontSizeToFit
          numberOfLines={1}
          minimumFontScale={0.5}
        >
          {displayUser}
          <RNText style={styles.usernameDot}>{'  ·  '}</RNText>
          <RNText style={styles.usernameYear}>{data.year}</RNText>
        </RNText>

        <RNText style={styles.statsHeader}>
          {data.totalShows} SHOWS
          <RNText style={styles.statsSep}>{'  ·  '}</RNText>
          {data.totalBands} BANDS
        </RNText>

        {/* TIER 1 — Headliners (2x2) */}
        {data.headliners.length > 0 && (
          <>
            <TierDivider label="HEADLINERS" />
            <HeadlinersGrid bands={data.headliners} />
          </>
        )}

        {/* TIER 2 — Special Guests */}
        {data.specialGuests.length > 0 && (
          <>
            <TierDivider label="SPECIAL GUESTS" />
            <BandsWithSeps
              bands={data.specialGuests}
              textStyle={styles.tierSub}
              sepStyle={styles.tierSubSep}
            />
          </>
        )}

        {/* TIER 3 — Featured Acts */}
        {data.featuredActs.length > 0 && (
          <>
            <TierDivider label="FEATURED ACTS" />
            <BandsWithSeps
              bands={data.featuredActs}
              textStyle={styles.tierMid}
              sepStyle={styles.tierMidSep}
            />
          </>
        )}

        {/* TIER 4 — Also Performing */}
        {data.alsoPerforming.length > 0 && (
          <>
            <TierDivider label="ALSO PERFORMING" />
            <BandsWithSeps
              bands={data.alsoPerforming}
              textStyle={styles.tierSupporting}
              sepStyle={styles.tierSupportingSep}
            />
          </>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <RNText style={styles.footerBrand}>
            METAL RADAR
            <RNText style={styles.footerBrandSep}>{'  ·  '}</RNText>
            A.D. {toRoman(data.year)}
          </RNText>
        </View>
      </View>
    </View>
  );
});

FestivalPoster.displayName = 'FestivalPoster';

function toRoman(year: number): string {
  const map: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let result = '';
  let n = year;
  for (const [val, sym] of map) {
    while (n >= val) {
      result += sym;
      n -= val;
    }
  }
  return result;
}

export default FestivalPoster;

const RED = colors.bloodBright;
const RED_DEEP = colors.blood;
const WHITE = colors.bright;
// SILVER y GREY son deliberadamente distintos de colors.silver/colors.muted:
// esto es la paleta de un póster exportable/compartible (estilo cartel de
// festival), no chrome de la UI — no debe seguir en automático futuros
// ajustes del tema, o los pósters ya generados/compartidos cambiarían de
// aspecto sin que nadie lo pidiera.
const SILVER = '#d8dade';
const GREY = '#a8abb4';

const styles = StyleSheet.create({
  poster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    backgroundColor: colors.ink,
    position: 'relative',
  },

  corner: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderColor: RED,
  },
  cornerTL: { top: 60, left: 60, borderTopWidth: 6, borderLeftWidth: 6 },
  cornerTR: { top: 60, right: 60, borderTopWidth: 6, borderRightWidth: 6 },
  cornerBL: { bottom: 60, left: 60, borderBottomWidth: 6, borderLeftWidth: 6 },
  cornerBR: { bottom: 60, right: 60, borderBottomWidth: 6, borderRightWidth: 6 },

  content: {
    flex: 1,
    paddingTop: 140,
    paddingBottom: 130,
    paddingHorizontal: 100,
    alignItems: 'center',
  },

  brandStamp: {
    fontFamily: FONT.specialElite,
    fontSize: 24,
    color: '#c7cad0',
    letterSpacing: 10,
    marginBottom: 32,
    opacity: 0.85,
  },

  usernameLine: {
    fontFamily: FONT.metalLord,
    fontSize: 130,
    color: WHITE,
    lineHeight: 140,
    letterSpacing: 0,
    marginBottom: 16,
    textAlign: 'center',
  },
  usernameDot: {
    color: RED,
  },
  usernameYear: {
    color: RED,
  },

  statsHeader: {
    fontFamily: FONT.specialElite,
    fontSize: 26,
    color: '#c7cad0',
    letterSpacing: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  statsSep: {
    color: RED,
  },

  tierDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: 38,
    marginBottom: 26,
    gap: 22,
  },
  tierDividerLine: {
    flex: 1,
    height: 2,
    backgroundColor: RED_DEEP,
  },
  tierDividerLabel: {
    fontFamily: FONT.specialElite,
    fontSize: 22,
    color: RED,
    letterSpacing: 10,
  },

  tierHeadliners: {
    width: '100%',
    gap: 30,
  },
  headlinerRow: {
    flexDirection: 'row',
    gap: 40,
  },
  headlinerCell: {
    flex: 1,
    alignItems: 'center',
  },
  headlinerText: {
    fontFamily: FONT.oswald,
    fontSize: 78,
    fontWeight: '700',
    color: WHITE,
    lineHeight: 86,
    letterSpacing: -1,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 16,
  },

  tierSub: {
    fontFamily: FONT.cinzelSemiBold,
    fontSize: 42,
    color: WHITE,
    lineHeight: 56,
    letterSpacing: 2,
    textAlign: 'center',
  },
  tierSubSep: {
    color: RED,
  },

  tierMid: {
    fontFamily: FONT.bebas,
    fontSize: 38,
    color: SILVER,
    lineHeight: 46,
    letterSpacing: 2,
    textAlign: 'center',
  },
  tierMidSep: {
    color: RED_DEEP,
  },

  tierSupporting: {
    fontFamily: FONT.anton,
    fontSize: 26,
    color: GREY,
    lineHeight: 36,
    letterSpacing: 1,
    textAlign: 'center',
  },
  tierSupportingSep: {
    color: RED_DEEP,
  },

  footer: {
    marginTop: 'auto',
    alignItems: 'center',
    paddingTop: 40,
  },
  footerDivider: {
    width: 200,
    height: 2,
    backgroundColor: RED_DEEP,
    marginBottom: 20,
  },
  footerBrand: {
    fontFamily: FONT.specialElite,
    fontSize: 22,
    color: '#82858d',
    letterSpacing: 8,
  },
  footerBrandSep: {
    color: RED,
  },
});
