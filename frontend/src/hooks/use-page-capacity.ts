"use client";
import { useEffect, useState } from "react";
/** Fit complete rows to the available table area; small screens retain ordinary scrolling. */
export function usePageCapacity(
  rowHeight: number,
  initial: number,
  maximum = 8,
) {
  const [node, ref] = useState<HTMLDivElement | null>(null);
  const [capacity, setCapacity] = useState(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry.contentRect.height) return;
      const next = window.matchMedia("(min-width: 1024px)").matches
        ? Math.max(
            1,
            Math.min(
              maximum,
              Math.floor((entry.contentRect.height - 50) / rowHeight),
            ),
          )
        : initial;
      setCapacity(next);
      setReady(true);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, rowHeight, initial, maximum]);
  return { ref, capacity, ready };
}
