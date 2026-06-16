import * as Calendar from 'expo-calendar';
import { Alert, Platform } from 'react-native';
import i18n from '../i18n';

type AddEventArgs = {
  title: string;
  startDate: Date;
  endDate?: Date;
  location?: string;
  notes?: string;
  url?: string;
  allDay?: boolean;
};

async function ensurePermissions(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(i18n.t('calendar.permissionDeniedTitle'), i18n.t('calendar.permissionDeniedBody'));
    return false;
  }
  return true;
}

async function getWritableCalendarId(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    return defaultCalendar?.id ?? null;
  }

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.find(
    (c) => c.allowsModifications && c.accessLevel === Calendar.CalendarAccessLevel.OWNER,
  );
  return writable?.id ?? calendars[0]?.id ?? null;
}

export async function addEventToCalendar(args: AddEventArgs): Promise<boolean> {
  try {
    const ok = await ensurePermissions();
    if (!ok) return false;

    const calendarId = await getWritableCalendarId();
    if (!calendarId) {
      Alert.alert(i18n.t('common.error'), i18n.t('calendar.noCalendarFound'));
      return false;
    }

    const endDate = args.endDate ?? new Date(args.startDate.getTime() + 3 * 60 * 60 * 1000);

    await Calendar.createEventAsync(calendarId, {
      title: args.title,
      startDate: args.startDate,
      endDate,
      location: args.location,
      notes: args.notes,
      url: args.url,
      allDay: args.allDay ?? false,
      alarms: [{ relativeOffset: -60 * 9 }, { relativeOffset: -60 * 24 }],
    });

    Alert.alert(i18n.t('calendar.addedTitle'), i18n.t('calendar.addedBody', { title: args.title }));
    return true;
  } catch (err: any) {
    console.warn('Calendar error:', err.message);
    Alert.alert(i18n.t('common.error'), err.message);
    return false;
  }
}
