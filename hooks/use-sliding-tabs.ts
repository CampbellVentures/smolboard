"use client";

import { useLayoutEffect, useRef } from "react";

export function useSlidingTabs(activeIndex: number, itemCount: number) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const positioned = useRef(false);

  function moveTo(index: number, animate: boolean) {
    const pill = pillRef.current;
    const tab = tabRefs.current[index];
    if (!pill || !tab) return;
    if (!animate) pill.style.transition = "none";
    pill.style.transform = `translateX(${tab.offsetLeft}px)`;
    pill.style.width = `${tab.offsetWidth}px`;
    if (!animate) {
      void pill.offsetWidth;
      pill.style.transition = "";
    }
  }

  useLayoutEffect(() => {
    moveTo(activeIndex, positioned.current);
    positioned.current = true;
  }, [activeIndex, itemCount]);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const observer = new ResizeObserver(() => moveTo(activeIndex, false));
    observer.observe(bar);
    return () => observer.disconnect();
  }, [activeIndex]);

  return { barRef, pillRef, tabRefs };
}
