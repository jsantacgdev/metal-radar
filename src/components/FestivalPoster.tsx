import { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { PosterData } from '../hooks/usePosterData';
import { colors, fontFamily, spacing } from '../theme';
import { Text } from './ui';

// Dimensiones 9:16 (Instagram Stories)
const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1920;

type Props = {
  data: PosterData;
  userName?: string;
};

const FestivalPoster = forwardRef<View, Props>(({ data, userName }, ref) => {
  return (
    <View ref={ref} style={styles.poster} collapsable={false}>
      {/* Esquinas decorativas */}
      <View style={[styles.cornerDecoration, styles.topLeft]} />
      <View style={[styles.cornerDecoration, styles.topRight]} />
      <View style={[styles.cornerDecoration, styles.bottomLeft]} />
      <View style={[styles.cornerDecoration, styles.bottomRight]} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brandLine}>METAL RADAR PRESENTS</Text>
        <Text style={styles.title}>MI {data.year}</Text>
        <View style={styles.divider} />
        <Text style={styles.subtitle}>
          {data.totalShows} SHOWS · {data.totalBands} BANDS
        </Text>
      </View>

      {/* Headliners (top 3) */}
      <View style={styles.headlinersSection}>
        {data.headliners.map((b, i) => (
          <Text key={b.id} style={styles.headlinerText} numberOfLines={1} adjustsFontSizeToFit>
            {b.name.toUpperCase()}
          </Text>
        ))}
      </View>

      {/* Divider */}
      <View style={styles.bigDivider} />

      {/* Sub-headliners (4-9) */}
      {data.subHeadliners.length > 0 && (
        <View style={styles.subHeadlinerSection}>
          <Text style={styles.tierLineRow} adjustsFontSizeToFit numberOfLines={2}>
            {data.subHeadliners.map((b) => b.name.toUpperCase()).join('  ·  ')}
          </Text>
        </View>
      )}

      {/* Main lineup */}
      {data.mainLineup.length > 0 && (
        <>
          <View style={styles.smallDivider} />
          <View style={styles.mainLineupSection}>
            <Text style={styles.mainLineupText}>
              {data.mainLineup.map((b) => b.name.toUpperCase()).join('  ·  ')}
            </Text>
          </View>
        </>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerDivider} />
        {userName && <Text style={styles.userName}>{userName.toUpperCase()}</Text>}
        <Text style={styles.footerBrand}>METAL RADAR · {data.year}</Text>
      </View>
    </View>
  );
});

FestivalPoster.displayName = 'FestivalPoster';

export default FestivalPoster;

const styles = StyleSheet.create({
  poster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    backgroundColor: '#0a0a0c',
    padding: 80,
    justifyContent: 'space-between',
  },
  cornerDecoration: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderColor: colors.bloodBright,
  },
  topLeft: {
    top: 40,
    left: 40,
    borderTopWidth: 6,
    borderLeftWidth: 6,
  },
  topRight: {
    top: 40,
    right: 40,
    borderTopWidth: 6,
    borderRightWidth: 6,
  },
  bottomLeft: {
    bottom: 40,
    left: 40,
    borderBottomWidth: 6,
    borderLeftWidth: 6,
  },
  bottomRight: {
    bottom: 40,
    right: 40,
    borderBottomWidth: 6,
    borderRightWidth: 6,
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
  },
  brandLine: {
    fontFamily: fontFamily.mono,
    fontSize: 28,
    color: colors.bloodBright,
    letterSpacing: 8,
    marginBottom: 30,
  },
  title: {
    fontFamily: 'MetalLord',
    fontSize: 240,
    color: '#fff',
    lineHeight: 240,
    letterSpacing: 2,
    textAlign: 'center',
  },
  divider: {
    width: 200,
    height: 4,
    backgroundColor: colors.bloodBright,
    marginVertical: 40,
  },
  subtitle: {
    fontFamily: fontFamily.mono,
    fontSize: 32,
    color: '#fff',
    letterSpacing: 6,
  },
  headlinersSection: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30,
    paddingHorizontal: 40,
  },
  headlinerText: {
    fontFamily: 'MetalLord',
    fontSize: 110,
    color: '#fff',
    letterSpacing: -2,
    textAlign: 'center',
    lineHeight: 110,
  },
  bigDivider: {
    width: '60%',
    height: 3,
    backgroundColor: colors.bloodBright,
    alignSelf: 'center',
    marginVertical: 40,
  },
  subHeadlinerSection: {
    paddingHorizontal: 20,
  },
  tierLineRow: {
    fontFamily: 'MetalLord',
    fontSize: 56,
    color: '#fff',
    letterSpacing: 2,
    textAlign: 'center',
    lineHeight: 70,
  },
  smallDivider: {
    width: '30%',
    height: 2,
    backgroundColor: colors.bloodBright,
    alignSelf: 'center',
    marginVertical: 30,
  },
  mainLineupSection: {
    paddingHorizontal: 60,
  },
  mainLineupText: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 36,
    color: '#ccc',
    letterSpacing: 1,
    textAlign: 'center',
    lineHeight: 50,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 60,
  },
  footerDivider: {
    width: 150,
    height: 2,
    backgroundColor: colors.bloodBright,
    marginBottom: 30,
  },
  userName: {
    fontFamily: fontFamily.displayBold,
    fontSize: 40,
    color: '#fff',
    letterSpacing: 4,
    marginBottom: 12,
  },
  footerBrand: {
    fontFamily: fontFamily.mono,
    fontSize: 24,
    color: colors.bloodBright,
    letterSpacing: 6,
  },
});
