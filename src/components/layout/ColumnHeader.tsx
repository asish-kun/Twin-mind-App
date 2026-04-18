import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ColumnHeaderProps {
  index: number;
  title: string;
  status?: ReactNode;
  className?: string;
}

export function ColumnHeader({ index, title, status, className }: ColumnHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-border/60 px-4 py-3",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <span>{index}.</span>
        <span>{title}</span>
      </div>
      {status && (
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
          {status}
        </div>
      )}
    </div>
  );
}
