import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { CommentTargetType } from '../hooks/useComments';
import { useRatingStats } from '../hooks/useRatingStats';
import { colors } from '../theme';
import { Text } from './ui';

type Props = {
  targetType: CommentTargetType;
  targetId: string;
};

export default function RatingStatsRow({ targetType, targetId }: Props) {
  const { t } = useTranslation();
  const { average, count } = useRatingStats(targetType, targetId);

  if (!average || count === 0) return null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Ionicons name="star" size={14} color={colors.bloodBright} />
      <Text variant="body" style={{ marginLeft: 4 }}>
        {average.toFixed(1)}
      </Text>
      <Text variant="monoSM" color="muted" style={{ marginLeft: 6 }}>
        {t('concertDetail.ratingCount', { count })}
      </Text>
    </View>
  );
}
