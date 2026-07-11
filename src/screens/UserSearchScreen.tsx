import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useUserSearch } from '../hooks/useUserSearch';
import { ProfileStackParamList } from '../navigation/ProfileStack';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import EmptyState from '../components/EmptyState';

export default function UserSearchScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const [query, setQuery] = useState('');
  const { results, searching } = useUserSearch(query);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.bright} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('social.searchTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchWrapper}>
        <Ionicons name="search" size={18} color={colors.muted} style={styles.searchIcon} />
        <TextInput
          style={styles.input}
          placeholder={t('social.searchPlaceholder')}
          placeholderTextColor={colors.faint}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        {searching && <ActivityIndicator color={colors.bloodBright} style={{ marginLeft: spacing.sm }} />}
      </View>

      {query.trim().length >= 2 && !searching && results.length === 0 && (
        <EmptyState
          icon="person-outline"
          title={t('social.searchEmptyTitle')}
          description={t('social.searchEmptyDesc')}
        />
      )}

      <View style={styles.listSection}>
        {results.map((item, i) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.row, i === results.length - 1 && { borderBottomWidth: 0 }]}
            onPress={() => navigation.navigate('PublicProfile', { userId: item.id })}
            activeOpacity={0.7}
          >
            <View style={styles.avatar}>
              <Ionicons name="person" size={20} color={colors.silver} />
            </View>
            <View style={styles.rowContent}>
              <Text variant="displaySM" numberOfLines={1}>
                @{item.username}
              </Text>
              {item.display_name && (
                <Text variant="monoSM" color="muted" numberOfLines={1} style={{ marginTop: 2 }}>
                  {item.display_name}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.bright,
    fontFamily: fontFamily.displayBold,
    fontSize: 16,
    letterSpacing: 0.5,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  searchIcon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    paddingVertical: spacing.md + 2,
    fontSize: 15,
    color: colors.bright,
    fontFamily: fontFamily.body,
  },
  listSection: { paddingHorizontal: spacing.xl, marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: { flex: 1, marginLeft: spacing.md, minWidth: 0 },
});
