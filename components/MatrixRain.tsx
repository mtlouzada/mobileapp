import React, { useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { theme } from '~/lib/theme';

// Classic falling-glyph "matrix rain", pure Reanimated (no GL). Sits behind a
// subject as a low-opacity green backdrop.
const GLYPHS = 'アカサタナハマヤラワabcdef0123456789ｦｧｨｩｪｫｬｭｮｯ$#@%&';
const COL_WIDTH = 22;
const ROWS = 26;

function randGlyphs(): string {
  let s = '';
  for (let i = 0; i < ROWS; i++) s += GLYPHS[Math.floor(Math.random() * GLYPHS.length)] + '\n';
  return s;
}

function Column({ x, height, delay, duration }: { x: number; height: number; delay: number; duration: number }) {
  const y = useSharedValue(-height);
  const chars = useMemo(randGlyphs, []);

  React.useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(withTiming(height, { duration, easing: Easing.linear }), -1, false),
    );
  }, []);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <Animated.Text style={[styles.column, { left: x }, style]} numberOfLines={ROWS}>
      {chars}
    </Animated.Text>
  );
}

export default function MatrixRain({ opacity = 0.22 }: { opacity?: number }) {
  const { width, height } = useWindowDimensions();
  const cols = Math.max(1, Math.floor(width / COL_WIDTH));

  const columns = useMemo(
    () =>
      Array.from({ length: cols }, (_, i) => ({
        x: i * COL_WIDTH,
        delay: Math.floor(Math.random() * 2600),
        duration: 4200 + Math.floor(Math.random() * 4200),
      })),
    [cols],
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none">
      {columns.map((c, i) => (
        <Column key={i} x={c.x} height={height} delay={c.delay} duration={c.duration} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  column: {
    position: 'absolute',
    top: 0,
    width: COL_WIDTH,
    fontSize: 16,
    lineHeight: 18,
    fontFamily: theme.fonts.regular,
    color: theme.colors.primary,
    textAlign: 'center',
  },
});
