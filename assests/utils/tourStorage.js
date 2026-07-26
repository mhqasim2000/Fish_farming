import AsyncStorage from '@react-native-async-storage/async-storage';

export const getTourStorageKey = userId =>
  userId ? `@fishfarm_tour_completed_${userId}` : null;

/** Per-user only — do not inherit a device-wide legacy flag for new accounts. */
export const isTourCompleted = async userId => {
  if (!userId) {
    return false;
  }

  const value = await AsyncStorage.getItem(getTourStorageKey(userId));
  return value === 'true';
};

export const markTourCompleted = async userId => {
  if (!userId) {
    return;
  }
  await AsyncStorage.setItem(getTourStorageKey(userId), 'true');
};
