import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { StyleSheet } from 'react-native';

import { colors } from '@/theme';

import type { StoreLocationMapProps } from './StoreLocationMap';

export function StoreLocationMap({
  latitude,
  longitude,
  name,
}: StoreLocationMapProps) {
  const coordinate = { latitude, longitude };

  return (
    <MapView
      accessibilityLabel={`Map showing ${name}`}
      initialRegion={{
        ...coordinate,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      }}
      pitchEnabled={false}
      provider={PROVIDER_GOOGLE}
      rotateEnabled={false}
      showsCompass={false}
      showsPointsOfInterests={false}
      style={styles.map}
      toolbarEnabled={false}
    >
      <Marker coordinate={coordinate} pinColor={colors.accent} title={name} />
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
    minHeight: 150,
  },
});
