// Speaker-portal reference pages: a run of show, a brand kit, travel notes.
//
// The requirement is "HTML embed support for existing reference material", so
// organizers point at material that already exists (a Notion page, a Google Doc,
// a video) instead of retyping it. That means accepting an embed from a user,
// which is only safe if the URL is constrained and the frame is sandboxed.
//
// We store a URL, never arbitrary markup. An organizer pasting a full <iframe>
// tag gets its src extracted. Anything that isn't an https URL is rejected
// outright, so there is no path from this field to script execution in the
// portal document.

export interface PortalResourceInput {
  title: string;
  body?: string;
  embedUrl?: string;
}

/** Hosts whose embeds we render. An allowlist rather than a blocklist: the
 *  point is reference material, and an open embed field on a page speakers
 *  visit is a phishing surface. */
export const EMBED_ALLOWED_HOSTS = [
  "docs.google.com",
  "drive.google.com",
  "calendar.google.com",
  "www.notion.so",
  "notion.so",
  "www.youtube.com",
  "youtube.com",
  "youtu.be",
  "player.vimeo.com",
  "vimeo.com",
  "www.loom.com",
  "loom.com",
  "www.figma.com",
  "figma.com",
  "airtable.com",
  "www.airtable.com",
] as const;

export interface EmbedResult {
  url?: string;
  error?: string;
}

/**
 * Accept either a bare URL or a pasted <iframe …> and return the embeddable
 * https URL. Returns an error string instead of throwing so the caller can
 * surface it on the field.
 */
export function normalizeEmbed(raw: string | undefined): EmbedResult {
  const value = (raw ?? "").trim();
  if (!value) return {};

  // Organizers paste the whole snippet from "Share → Embed" far more often
  // than they paste a bare URL, so pull the src out rather than rejecting it.
  let candidate = value;
  if (/^<\s*iframe/i.test(value)) {
    const src = value.match(/\ssrc\s*=\s*["']([^"']+)["']/i);
    if (!src) return { error: "That embed code has no src. Paste the URL instead." };
    candidate = src[1].trim();
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { error: "That doesn't look like a URL." };
  }
  // https only: an http frame on an https portal is blocked by the browser
  // anyway, and javascript:/data: must never reach an iframe src.
  if (parsed.protocol !== "https:") {
    return { error: "Embeds must be https links." };
  }
  const host = parsed.hostname.toLowerCase();
  if (!EMBED_ALLOWED_HOSTS.includes(host as (typeof EMBED_ALLOWED_HOSTS)[number])) {
    return {
      error: `${host} isn't an allowed embed host. Link to it in the page body instead.`,
    };
  }
  // Drop any credentials or fragment; neither belongs in a frame we render.
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  return { url: parsed.toString() };
}

export function validateResource(input: PortalResourceInput): {
  ok: boolean;
  error?: string;
  embedUrl?: string;
} {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "A title is required." };
  if (title.length > 120) return { ok: false, error: "Keep the title under 120 characters." };
  if ((input.body ?? "").length > 20000) {
    return { ok: false, error: "That page is too long. Link to the document instead." };
  }
  const embed = normalizeEmbed(input.embedUrl);
  if (embed.error) return { ok: false, error: embed.error };
  return { ok: true, embedUrl: embed.url };
}
