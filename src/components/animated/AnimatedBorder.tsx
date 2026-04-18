"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type HTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

export type AnimatedBorderState = "idle" | "active" | "flash" | "stream";

export interface AnimatedBorderHandle {
  flash: () => void;
}

interface AnimatedBorderProps extends HTMLAttributes<HTMLDivElement> {
  state?: AnimatedBorderState;
  children: React.ReactNode;
  tone?: "indigo" | "emerald" | "violet";
}

const TONE: Record<
  NonNullable<AnimatedBorderProps["tone"]>,
  { a: string; b: string; flash: string }
> = {
  indigo: {
    a: "hsl(226 90% 62%)",
    b: "hsl(256 90% 66%)",
    flash: "linear-gradient(120deg, hsl(210 88% 70% / 0.9), hsl(266 70% 70% / 0.9))",
  },
  violet: {
    a: "hsl(264 90% 66%)",
    b: "hsl(296 85% 66%)",
    flash: "linear-gradient(120deg, hsl(266 70% 70% / 0.9), hsl(210 88% 70% / 0.9))",
  },
  emerald: {
    a: "hsl(158 70% 45%)",
    b: "hsl(186 80% 48%)",
    flash: "linear-gradient(120deg, hsl(148 60% 60% / 0.9), hsl(199 80% 60% / 0.9))",
  },
};

/**
 * Card with a moving light that sweeps around its border.
 *
 * Implementation:
 *  - Outer: rounded, `overflow-hidden`, 1.5px padding, subtle static border background.
 *  - Rotating layer: absolute, oversized (inset -150% so its bounding box is
 *    ~4× the container). Conic gradient with two transparent arcs; rotating
 *    the whole layer via `transform: rotate()` sweeps the gradient's bright
 *    arcs around the visible border slice without the corners swinging out.
 *  - Flash layer: brief opacity pulse on top for arrival events (new
 *    suggestion batch, new chat message).
 *  - Content: inner rounded card sits on top, opaque, so only the border
 *    ring of the gradient is ever visible.
 *
 * Honours `prefers-reduced-motion` via the global CSS override.
 */
export const AnimatedBorder = forwardRef<AnimatedBorderHandle, AnimatedBorderProps>(
  ({ state = "idle", tone = "indigo", children, className, ...rest }, ref) => {
    const [flashing, setFlashing] = useState(false);
    const timer = useRef<number | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        flash: () => {
          setFlashing(true);
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setFlashing(false), 800);
        },
      }),
      [],
    );

    const effective: AnimatedBorderState = flashing ? "flash" : state;
    const isMoving = effective === "active" || effective === "stream";
    const t = TONE[tone];

    // Two bright arcs (~40° each) on opposite sides of the disc, separated
    // by transparent sweeps. Rotating the layer sweeps them around the card.
    const conic = `conic-gradient(from 0deg,
      transparent 0deg,
      ${t.a} 25deg,
      ${t.b} 55deg,
      transparent 95deg,
      transparent 180deg,
      ${t.b} 205deg,
      ${t.a} 235deg,
      transparent 275deg,
      transparent 360deg)`;

    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl p-[1.5px]",
          // Static fallback border — always visible under the rotating layer
          "bg-border/70",
          className,
        )}
        {...rest}
      >
        {/* Rotating "light" layer */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-[-150%] transition-opacity duration-300",
            isMoving ? "opacity-100" : "opacity-0",
            effective === "active" && "animate-[border-spin_4s_linear_infinite]",
            effective === "stream" && "animate-[border-spin_2.2s_linear_infinite]",
          )}
          style={{ background: conic }}
        />

        {/* Flash overlay (border-only because inner card covers the middle) */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0",
            flashing && "animate-border-flash",
          )}
          style={{ background: t.flash, opacity: 0 }}
        />

        {/* Inner content card — opaque so the rotating layer only shows
            through the thin padding ring at the edges. */}
        <div className="relative h-full rounded-[14px] bg-card">{children}</div>
      </div>
    );
  },
);
AnimatedBorder.displayName = "AnimatedBorder";
