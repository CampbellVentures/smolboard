"use client";

import React from "react";

// A tab that points at a section of the page it is already on.
//
// A plain <a href="#schedule"> does not work here: Pylon's runtime installs a
// global click handler for same-origin anchors, so the click became a
// navigation to the path we were already on. The URL gained the fragment, the
// page never scrolled, and no hashchange fired for anything to react to.
// Measured: scrollY stayed 0 on click while a direct load of the same URL
// scrolled to 499.
//
// So own the click: stop the router seeing it, put the fragment in the address
// bar, and scroll.
export function SectionTab({
  targetId,
  href,
  className,
  children,
}: {
  targetId: string;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        const target = document.getElementById(targetId);
        if (!target) return; // Let the browser do the normal thing.
        event.preventDefault();
        event.stopPropagation();
        window.history.replaceState(null, "", `#${targetId}`);
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      {children}
    </a>
  );
}
