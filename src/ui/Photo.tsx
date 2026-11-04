import type { ReactNode } from "react";
import { photo } from "../data";
import { cn } from "../utils/cn";

export function Photo({
  id,
  w = 800,
  h = 520,
  alt = "",
  className,
  children,
}: {
  id: number;
  w?: number;
  h?: number;
  alt?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("photo", className)}>
      <img src={photo(id, w, h)} alt={alt} width={w} height={h} loading="lazy" />
      {children}
    </div>
  );
}
