import { Ionicons } from '@expo/vector-icons';
import { StatusType } from '../hooks/useComments';

export const STATUS_CHIPS: { type: StatusType; icon: keyof typeof Ionicons.glyphMap; labelKey: string }[] = [
  { type: 'going_alone', icon: 'person-outline', labelKey: 'comments.status.goingAlone' },
  { type: 'has_car_space', icon: 'car-outline', labelKey: 'comments.status.hasCarSpace' },
  { type: 'looking_for_ride', icon: 'hand-left-outline', labelKey: 'comments.status.lookingForRide' },
];
