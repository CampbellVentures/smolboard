// Merge tags for directory outreach: {{first_name}}, {{company}}, and friends.
// Unknown tags render empty rather than leaking the raw token into an email.
export function applyMergeTags(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => vars[key.toLowerCase()] ?? "");
}

export const CONTACT_MERGE_TAGS = ["first_name", "name", "company", "job_title", "email"];
