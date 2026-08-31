export type SupportedPlatform = 'android' | 'ios' | 'web';

export const MINIMUM_TOUCH_TARGET = {
  android: 48,
  ios: 44,
  web: 44,
} as const satisfies Readonly<Record<SupportedPlatform, number>>;

export function getMinimumTouchTarget(platform: SupportedPlatform): number {
  return MINIMUM_TOUCH_TARGET[platform];
}

export function getTouchTargetInsets(
  visualSize: number,
  platform: SupportedPlatform,
): Readonly<{ bottom: number; left: number; right: number; top: number }> | undefined {
  if (!Number.isFinite(visualSize) || visualSize <= 0) return undefined;
  const inset = Math.max(0, (getMinimumTouchTarget(platform) - visualSize) / 2);
  return inset === 0 ? undefined : { bottom: inset, left: inset, right: inset, top: inset };
}

export function resolveMotionDuration(durationMs: number, reduceMotion: boolean): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) return 0;
  return reduceMotion ? 0 : durationMs;
}

export function supportsTwoHundredPercentText(fontScale: number): boolean {
  return Number.isFinite(fontScale) && fontScale >= 2;
}
