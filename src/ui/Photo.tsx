import type { ReactNode } from "react";
import { photo } from "../data";
import { cn } from "../utils/cn";

export function Photo({
  id,
  w = 800,
  h = 520,
  alt = "",
  priority = false,
  className,
  children,
}: {
  id: number;
  w?: number;
  h?: number;
  alt?: string;
  /** Above-the-fold art: load eagerly so it can be the LCP element. */
  priority?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("photo", className)}>
      <img
        src={photo(id, w, h)}
        alt={alt}
        width={w}
        height={h}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding={priority ? "sync" : "async"}
      />
      {children}
    </div>
  );
}
