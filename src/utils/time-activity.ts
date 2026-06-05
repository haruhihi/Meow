export const PLACEHOLDER_ACTIVITY_NAME = '占位';

export const getDefaultTimeEntryActivityTypeIds = (activityTypes: { id: number; name: string }[]) => {
  const placeholderActivityType = activityTypes.find((activityType) => activityType.name === PLACEHOLDER_ACTIVITY_NAME);
  const defaultActivityType = placeholderActivityType ?? activityTypes[0];
  return defaultActivityType ? [String(defaultActivityType.id)] : undefined;
};