import { readFileSync } from "node:fs";

// Fonts for the opengraph-image cards, vendored under assets/fonts/ because
// the published @pylonsync/functions package is currently missing its bundled
// Inter files (reported upstream). Server-only — never import from client
// code. The SSR runner's cwd is the project root.
export function ogFonts() {
  return [
    {
      name: "Inter",
      data: readFileSync(`${process.cwd()}/assets/fonts/Inter-Regular.ttf`),
      weight: 400 as const,
      style: "normal" as const,
    },
    {
      name: "Inter",
      data: readFileSync(`${process.cwd()}/assets/fonts/Inter-SemiBold.ttf`),
      weight: 600 as const,
      style: "normal" as const,
    },
  ];
}
