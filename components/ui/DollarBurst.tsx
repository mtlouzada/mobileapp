import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { theme } from "~/lib/theme";

// ─── Double-tap "$" money burst ──────────────────────────────────────────────
// Cash-toss physics: each "$" pops up + out from the tap point, then gravity
// rains it back down while it spins and fades. Big, bold, widely spread so the
// glyph stays legible instead of clumping. Shared by the video feed and the
// immersive profile post viewer.

const CONFETTI_COUNT = 12;
type Particle = { dx: number; rise: number; fall: number; rotate: number; size: number };

function makeConfetti(): Particle[] {
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => {
    const dir = i % 2 === 0 ? 1 : -1; // alternate sides for an even fan-out
    return {
      dx: dir * (60 + Math.random() * 190),
      rise: 80 + Math.random() * 150,
      fall: 260 + Math.random() * 220,
      rotate: (Math.random() * 2 - 1) * 480,
      size: 30 + Math.random() * 24,
    };
  });
}

export interface DollarBurstHandle {
  /** Fire the burst centered at (x, y) in the parent's coordinate space. */
  play: (x: number, y: number) => void;
}

export const DollarBurst = forwardRef<DollarBurstHandle>((_props, ref) => {
  const [burst, setBurst] = useState<{ x: number; y: number; particles: Particle[] } | null>(null);
  // One driver per particle so they launch in a quick stagger (a "spray").
  const vals = useRef(
    Array.from({ length: CONFETTI_COUNT }, () => new Animated.Value(0))
  ).current;

  useImperativeHandle(ref, () => ({
    play: (x: number, y: number) => {
      setBurst({ x, y, particles: makeConfetti() });
      vals.forEach((v) => v.setValue(0));
      Animated.stagger(
        28,
        vals.map((v) =>
          Animated.timing(v, {
            toValue: 1,
            duration: 1050,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          })
        )
      ).start(({ finished }) => {
        if (finished) setBurst(null);
      });
    },
  }));

  if (!burst) return null;

  return (
    <View pointerEvents="none" style={[styles.anchor, { left: burst.x, top: burst.y }]}>
      {burst.particles.map((p, i) => {
        const v = vals[i];
        return (
          <Animated.Text
            key={i}
            style={[
              styles.confetti,
              {
                fontSize: p.size,
                opacity: v.interpolate({
                  inputRange: [0, 0.12, 0.72, 1],
                  outputRange: [0, 1, 1, 0],
                }),
                transform: [
                  { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
                  {
                    // pop up, then gravity rains it back down past the tap
                    translateY: v.interpolate({
                      inputRange: [0, 0.4, 1],
                      outputRange: [0, -p.rise, p.fall],
                    }),
                  },
                  {
                    rotate: v.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", `${p.rotate}deg`],
                    }),
                  },
                  {
                    scale: v.interpolate({
                      inputRange: [0, 0.2, 1],
                      outputRange: [0.3, 1.2, 0.9],
                    }),
                  },
                ],
              },
            ]}
          >
            $
          </Animated.Text>
        );
      })}
    </View>
  );
});

DollarBurst.displayName = "DollarBurst";

const styles = StyleSheet.create({
  // Zero-size anchor at the tap point; particles spread out from here.
  anchor: { position: "absolute", width: 0, height: 0, zIndex: 20 },
  confetti: {
    position: "absolute",
    color: theme.colors.primary,
    fontFamily: theme.fonts.bold,
    textShadowColor: theme.colors.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});
