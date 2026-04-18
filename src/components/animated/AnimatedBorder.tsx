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
  /** Tailwind color utility applied to the gradient stops. Defaults to indigo/violet. */
  tone?: "indigo" | "emerald" | "violet";
}

/**
 * Wraps children in a card with an animated gradient border.
 *
 * Implementation: the outer div is a rounded container with an inner white card
 * padded 1px. The gradient "border" is the outer div's background, which
 * animates via `--angle` (CSS conic gradient). `flash` overlays a timed opacity
 * pulse; `stream` keeps a slow-moving gradient; `idle` is a static slate border.
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

    const gradient =
      tone === "emerald"
        ? "from-emerald-300 via-teal-300 to-sky-300"
        : tone === "violet"
          ? "from-violet-300 via-fuchsia-300 to-indigo-300"
          : "from-indigo-300 via-sky-300 to-violet-300";

    return (
      <div
        className={cn(
          "relative rounded-2xl p-[1px] transition-colors",
          effective === "idle" && "bg-border/80",
          className,
        )}
        {...rest}
      >
        {/* Animated gradient layer */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300",
            (effective === "active" || effective === "stream") && "opacity-100",
          )}
        >
          <div
            className={cn(
              "h-full w-full rounded-2xl bg-gradient-to-r",
              gradient,
              effective === "active" && "animate-[border-spin_6s_linear_infinite]",
              effective === "stream" && "animate-[border-spin_14s_linear_infinite]",
            )}
            style={{
              backgroundSize: "200% 200%",
            }}
          />
        </div>

        {/* Flash layer */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 rounded-2xl",
            flashing && "animate-border-flash",
          )}
          style={{
            background:
              tone === "emerald"
                ? "linear-gradient(120deg, hsl(148 60% 60% / 0.9), hsl(199 80% 60% / 0.9))"
                : tone === "violet"
                  ? "linear-gradient(120deg, hsl(266 70% 70% / 0.9), hsl(210 88% 70% / 0.9))"
                  : "linear-gradient(120deg, hsl(210 88% 70% / 0.9), hsl(266 70% 70% / 0.9))",
            opacity: 0,
          }}
        />

        <div className="relative rounded-[15px] bg-card">{children}</div>
      </div>
    );
  },
);
AnimatedBorder.displayName = "AnimatedBorder";
