// Re-exports the marketing content from the single site config so existing
// `@/lib/site` imports keep working. Edit lib/site.config.ts.
export {
  COMPANY,
  bySlug,
  type ContentSection,
  type SitePage,
} from "./site.config";
