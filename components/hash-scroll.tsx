"use client";

import { useEffect } from "react";

// Scroll to the fragment the URL asks for.
//
// The section ids are in the server HTML, and the tabs are plain <a> anchors,
// so the browser should handle this. It does not: scroll ends at 0 even on a
// direct load of /event#schedule, because hydration lands after the browser has
// already resolved the fragment and the position is reset. Measured: target at
// 523px, document 3916px tall, window.scrollY 0.
//
// So do it once after mount, and again on hashchange for clicks that only
// change the fragment.
export function HashScroll() {
  useEffect(() => {
    const go = () => {
      const id = window.location.hash.slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    // A frame after mount, so the layout the hero and images settle into is the
    // one we measure against.
    const timer = window.setTimeout(go, 60);
    window.addEventListener("hashchange", go);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", go);
    };
  }, []);
  return null;
}
