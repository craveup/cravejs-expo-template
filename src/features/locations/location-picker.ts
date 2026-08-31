export type LocationPickerItem = {
  address: string;
  distanceLabel?: string;
  id: string;
  name: string;
};

export type LocationPickerState = 'loading' | 'error' | 'empty' | 'results';

export function filterLocations(
  locations: readonly LocationPickerItem[],
  query: string,
): LocationPickerItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...locations];
  return locations.filter((location) =>
    `${location.name} ${location.address}`.toLocaleLowerCase().includes(normalizedQuery),
  );
}

export function getLocationPickerState(
  resultCount: number,
  loading: boolean,
  errorMessage?: string,
): LocationPickerState {
  if (loading) return 'loading';
  if (errorMessage) return 'error';
  if (resultCount === 0) return 'empty';
  return 'results';
}

export function getLocationPickerSectionLabel(
  locations: readonly LocationPickerItem[],
): 'NEAREST TO YOU' | 'PICKUP LOCATIONS' {
  return locations.length > 0 &&
    locations.every((location) => location.distanceLabel !== undefined)
    ? 'NEAREST TO YOU'
    : 'PICKUP LOCATIONS';
}
