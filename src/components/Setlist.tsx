import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Setlist, useRefreshSetlist } from '../hooks/useSetlist';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from './ui';

type Props = {
  concertId: string;
  setlist: Setlist | null;
  bandId: string;
  bandName: string;
};

function useFormatDuration() {
  const { t } = useTranslation();
  return (min: number | null): string => {
    if (!min || min <= 0) return '';
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return t('setlist.durationMin', { min: m });
    if (m === 0) return t('setlist.durationH', { h });
    return t('setlist.durationHM', { h, m });
  };
}

export default function SetlistView({ concertId, setlist, bandId, bandName }: Props) {
  const { t } = useTranslation();
  const refresh = useRefreshSetlist();
  const [expanded, setExpanded] = useState(false);
  const formatDuration = useFormatDuration();

  const handleRefresh = () => {
    refresh.mutate({ concertId, bandId, force: true });
  };

  if (!setlist || setlist.not_found || setlist.song_count === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text variant="monoMD" color="muted">
            {t('setlist.headerLabel', { band: bandName.toUpperCase() })}
          </Text>
        </View>
        <View style={styles.emptyBox}>
          <Ionicons name="musical-notes-outline" size={28} color={colors.silver} />
          <Text
            variant="bodySM"
            color="silver"
            style={{ marginTop: spacing.sm, textAlign: 'center' }}
          >
            {setlist?.not_found ? t('setlist.notFound') : t('setlist.notSearchedYet')}
          </Text>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={handleRefresh}
            disabled={refresh.isPending}
            activeOpacity={0.7}
          >
            {refresh.isPending ? (
              <ActivityIndicator size="small" color={colors.bloodBright} />
            ) : (
              <>
                <Ionicons name="refresh" size={14} color={colors.bloodBright} />
                <Text variant="monoSM" color="bloodBright" style={{ marginLeft: 6 }}>
                  {t('setlist.searchButton')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const hasMore = setlist.songs.length > 8;
  const mainSongs = setlist.songs.filter((s) => !s.encore);
  const encoreSongs = setlist.songs.filter((s) => s.encore);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text variant="monoMD" color="muted">
            {t('setlist.headerLabel', { band: bandName.toUpperCase() })}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.badge}>
              <Text variant="monoSM" color="bloodBright">
                {t('setlist.realSetlist')}
              </Text>
            </View>
            <Text variant="monoSM" color="silver">
              {t('setlist.songsCount', { count: setlist.song_count })}
            </Text>
            {setlist.total_duration_minutes != null && (
              <Text variant="monoSM" color="silver">
                · {formatDuration(setlist.total_duration_minutes)}
              </Text>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={handleRefresh} disabled={refresh.isPending} hitSlop={10}>
          {refresh.isPending ? (
            <ActivityIndicator size="small" color={colors.silver} />
          ) : (
            <Ionicons name="refresh" size={18} color={colors.silver} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.songsBox}>
        {(expanded ? mainSongs : mainSongs.slice(0, 8)).map((song) => (
          <SongRow key={song.position} song={song} />
        ))}

        {!expanded && hasMore && (
          <TouchableOpacity onPress={() => setExpanded(true)} style={styles.moreBtn}>
            <Text variant="monoSM" color="bloodBright">
              {t('setlist.showMore', { count: setlist.songs.length - 8 })} ↓
            </Text>
          </TouchableOpacity>
        )}

        {expanded && encoreSongs.length > 0 && (
          <>
            <View style={styles.encoreDivider}>
              <View style={styles.dividerLine} />
              <Text variant="monoSM" color="bloodBright" style={{ marginHorizontal: spacing.sm }}>
                {t('setlist.encoreLabel')}
              </Text>
              <View style={styles.dividerLine} />
            </View>
            {encoreSongs.map((song) => (
              <SongRow key={song.position} song={song} />
            ))}
          </>
        )}

        {expanded && hasMore && (
          <TouchableOpacity onPress={() => setExpanded(false)} style={styles.moreBtn}>
            <Text variant="monoSM" color="silver">
              {t('setlist.showLess')} ↑
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function SongRow({
  song,
}: {
  song: {
    name: string;
    position: number;
    cover_of: string | null;
    is_tape: boolean;
    duration_ms: number | null;
  };
}) {
  const { t } = useTranslation();
  const durationStr =
    song.duration_ms && song.duration_ms > 0
      ? `${Math.floor(song.duration_ms / 60000)}:${String(
          Math.round((song.duration_ms % 60000) / 1000),
        ).padStart(2, '0')}`
      : null;

  return (
    <View style={styles.songRow}>
      <Text variant="monoSM" color="muted" style={styles.songNum}>
        {String(song.position).padStart(2, '0')}
      </Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodySM" numberOfLines={1} style={{ color: colors.bright }}>
          {song.name}
        </Text>
        <View style={styles.songMeta}>
          {song.cover_of && (
            <View style={styles.coverTag}>
              <Text
                style={{
                  fontFamily: fontFamily.mono,
                  fontSize: 9,
                  letterSpacing: 0.6,
                  color: colors.bloodBright,
                }}
              >
                {t('setlist.coverTag', { artist: song.cover_of.toUpperCase() })}
              </Text>
            </View>
          )}
          {song.is_tape && (
            <Text
              style={{
                fontFamily: fontFamily.mono,
                fontSize: 9,
                letterSpacing: 0.6,
                color: colors.muted,
                marginLeft: 8,
              }}
            >
              {t('setlist.tapeTag')}
            </Text>
          )}
        </View>
      </View>
      {durationStr && (
        <Text variant="monoSM" color="muted" style={{ marginLeft: spacing.sm }}>
          {durationStr}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
  },
  emptyBox: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
    backgroundColor: colors.panel,
    alignItems: 'center',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    marginTop: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    backgroundColor: colors.bloodTint,
  },
  songsBox: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  songNum: {
    width: 26,
  },
  songMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  coverTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
  },
  moreBtn: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  encoreDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.line,
  },
});
