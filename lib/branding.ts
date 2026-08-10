// Event branding: a small JSON blob on Event.brandingJson edited on the
// Branding page and rendered by the public event site. Parsing is defensive —
// a malformed blob degrades to defaults, never a broken public page.

export interface EventBranding {
  accent: string | null;
  logoUrl: string | null;
  tagline: string | null;
}

export const DEFAULT_BRANDING: EventBranding = {
  accent: null,
  logoUrl: null,
  tagline: null,
};

// Curated accents that hold up on white — shown as swatches on the Branding
// page. Custom hex is allowed too.
export const ACCENT_PRESETS = [
  { name: "Violet", value: "#7c3aed" },
  { name: "Blue", value: "#2563eb" },
  { name: "Teal", value: "#0d9488" },
  { name: "Green", value: "#16a34a" },
  { name: "Amber", value: "#d97706" },
  { name: "Orange", value: "#ea580c" },
  { name: "Rose", value: "#e11d48" },
  { name: "Slate", value: "#334155" },
] as const;

export function isValidAccent(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function cleanUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  // http(s) or site-relative only — no javascript:, data:, etc.
  if (/^https?:\/\//i.test(v) || v.startsWith("/")) return v;
  return null;
}

export function parseBranding(raw: unknown): EventBranding {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return DEFAULT_BRANDING;
    try {
      obj = JSON.parse(raw);
    } catch {
      return DEFAULT_BRANDING;
    }
  }
  if (!obj || typeof obj !== "object") return DEFAULT_BRANDING;
  const rec = obj as Record<string, unknown>;
  const accent =
    typeof rec.accent === "string" && isValidAccent(rec.accent) ? rec.accent.trim() : null;
  const tagline =
    typeof rec.tagline === "string" && rec.tagline.trim() ? rec.tagline.trim().slice(0, 160) : null;
  return { accent, logoUrl: cleanUrl(rec.logoUrl), tagline };
}
