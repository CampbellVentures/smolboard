export function canClaimCfpEmail(
  existingUserId: string | undefined,
  authenticatedUserId: string | undefined,
) {
  if (!existingUserId) return !authenticatedUserId;
  return existingUserId === authenticatedUserId;
}
