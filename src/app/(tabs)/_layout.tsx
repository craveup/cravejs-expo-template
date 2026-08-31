import { Tabs } from 'expo-router';

import { PresentationIcon } from '@/features/_shared';
import { colors, sizes, textStyles } from '@/theme';

export default function CatalogTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.iconMuted,
        tabBarItemStyle: { minHeight: sizes.minimumTouchTarget },
        tabBarLabelStyle: {
          fontFamily: textStyles.label.fontFamily,
          fontSize: textStyles.label.fontSize,
          letterSpacing: textStyles.label.letterSpacing,
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.divider,
          height: sizes.bottomNavigation,
        },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          tabBarIcon: ({ color }) => (
            <PresentationIcon color={color} name="home" size={23} />
          ),
          title: 'HOME',
        }}
      />
      <Tabs.Screen
        name="(menu)"
        options={{
          tabBarIcon: ({ color }) => (
            <PresentationIcon color={color} name="menu" size={23} />
          ),
          title: 'MENU',
        }}
      />
      <Tabs.Screen
        name="(bag)"
        options={{
          tabBarIcon: ({ color }) => (
            <PresentationIcon color={color} name="store" size={23} />
          ),
          title: 'BAG',
        }}
      />
      <Tabs.Screen
        name="(rewards)"
        options={{
          tabBarIcon: ({ color }) => (
            <PresentationIcon color={color} name="star" size={23} />
          ),
          title: 'REWARDS',
        }}
      />
    </Tabs>
  );
}
