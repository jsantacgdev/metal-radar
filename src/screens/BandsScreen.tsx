import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BandSearch, { SearchedBand } from '../components/BandSearch';
import { useFollowedBands } from '../hooks/useFollowedBands';
import { useRecommendations, RecommendedBand } from '../hooks/useRecomendations';
import { followBand } from '../lib/bands';
import { useQueryClient } from '@tanstack/react-query';

export default function BandsScreen() {
  const { bands: followedBands, loading: loadingFollowed, unfollow } = useFollowedBands();

  const { recommendations, loading: loadingRecs } = useRecommendations();

  const followedSpotifyIds = useMemo(() => {
    return new Set<string>();
  }, [followedBands]);

  const followedNames = useMemo(
    () => new Set(followedBands.map((b) => b.name.toLowerCase())),
    [followedBands],
  );

  const visibleRecs = recommendations.filter((r) => !followedNames.has(r.name.toLowerCase()));

  const queryClient = useQueryClient();

  const [followingId, setFollowingId] = useState<string | null>(null);

  const [newBandIds, setNewBandIds] = useState<Set<string>>(new Set());
  const previousIdsRef = useRef<Set<string> | null>(null);

  const handleFollowSearched = async (band: SearchedBand) => {
    await followBand(band);
    queryClient.invalidateQueries({
      queryKey: ['followedBands'],
    });
    queryClient.invalidateQueries({
      queryKey: ['recommendations'],
    });
  };

  const handleFollowRec = async (band: RecommendedBand) => {
    if (followingId) return; // ya hay una operación en curso
    try {
      setFollowingId(band.spotify_id);
      await followBand(band);
      queryClient.invalidateQueries({
        queryKey: ['followedBands'],
      });
      queryClient.invalidateQueries({
        queryKey: ['recommendations'],
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setFollowingId(null);
    }
  };

  const handleUnfollow = (bandId: string, bandName: string) => {
    Alert.alert('Dejar de seguir', `¿Quitar a ${bandName}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: () => unfollow(bandId),
      },
    ]);
  };

  // Detectar bandas nuevas en recomendaciones
  useEffect(() => {
    if (recommendations.length === 0) return;

    const currentIds = new Set(recommendations.map((r) => r.spotify_id));

    // Primera carga: solo guardamos referencia, no marcamos nada
    if (previousIdsRef.current === null) {
      previousIdsRef.current = currentIds;
      return;
    }

    // Detectar las que no estaban antes
    const fresh = new Set<string>();
    for (const id of currentIds) {
      if (!previousIdsRef.current.has(id)) fresh.add(id);
    }

    previousIdsRef.current = currentIds;

    if (fresh.size > 0) {
      setNewBandIds((prev) => new Set([...prev, ...fresh]));

      // Quitar el badge después de 8 segundos
      setTimeout(() => {
        setNewBandIds((prev) => {
          const next = new Set(prev);
          for (const id of fresh) next.delete(id);
          return next;
        });
      }, 8000);
    }
  }, [recommendations]);

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: '#0a0a0a',
      }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={loadingFollowed || loadingRecs} tintColor="#dc2626" />
      }
    >
      {/* Buscador */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Buscar bandas</Text>
        <BandSearch onFollow={handleFollowSearched} followedSpotifyIds={followedSpotifyIds} />
      </View>

      {/* Tus bandas */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tus bandas ({followedBands.length})</Text>
        {loadingFollowed ? (
          <ActivityIndicator color="#dc2626" />
        ) : followedBands.length === 0 ? (
          <Text style={styles.emptyText}>Sigue bandas para ver sus conciertos</Text>
        ) : (
          followedBands.map((b) => (
            <View key={b.id} style={styles.row}>
              {b.image_url ? (
                <Image source={{ uri: b.image_url }} style={styles.image} />
              ) : (
                <View style={[styles.image, { backgroundColor: '#333' }]} />
              )}
              <Text style={styles.bandName}>{b.name}</Text>
              <TouchableOpacity onPress={() => handleUnfollow(b.id, b.name)}>
                <Text style={styles.unfollow}>Quitar</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* Recomendadas */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recomendadas para ti</Text>
        <Text style={styles.sectionDescription}>Bandas similares a las que sigues</Text>
        {loadingRecs ? (
          <ActivityIndicator color="#dc2626" />
        ) : visibleRecs.length === 0 ? (
          <Text style={styles.emptyText}>Sin recomendaciones por ahora</Text>
        ) : (
          visibleRecs.map((rec) => (
            <View key={rec.spotify_id} style={styles.row}>
              {rec.image_url ? (
                <Image source={{ uri: rec.image_url }} style={styles.image} />
              ) : (
                <View style={[styles.image, { backgroundColor: '#333' }]} />
              )}
              <View
                style={{
                  flex: 1,
                  marginLeft: 12,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <Text style={styles.bandName} numberOfLines={1}>
                    {rec.name}
                  </Text>
                  {newBandIds.has(rec.spotify_id) && (
                    <View style={styles.newBadge}>
                      <Text style={styles.newBadgeText}>NUEVO</Text>
                    </View>
                  )}
                </View>
                {rec.genres.length > 0 && (
                  <Text style={styles.genres} numberOfLines={1}>
                    {rec.genres.slice(0, 3).join(' · ')}
                  </Text>
                )}
              </View>
              <TouchableOpacity style={styles.followBtn} onPress={() => handleFollowRec(rec)}>
                <Text style={styles.followBtnText}>Seguir</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  sectionDescription: {
    color: '#777',
    fontSize: 13,
    marginBottom: 12,
  },
  emptyText: {
    color: '#666',
    fontStyle: 'italic',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  image: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  bandName: {
    color: '#fff',
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  genres: {
    color: '#777',
    fontSize: 12,
    marginTop: 2,
  },
  unfollow: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '600',
  },
  followBtn: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  followBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  newBadge: {
    backgroundColor: '#1f7a3a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 10,
  },
  newBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
});
