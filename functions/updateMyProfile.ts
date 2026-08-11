import { mutation, v } from "@pylonsync/functions";

// The User row is read-only to clients (user_self policy allows read, never
// write), so display-name edits come through here where the handler can pin
// the target to the caller's own id.
export default mutation<{ displayName: string }, { displayName: string }>({
  args: { displayName: v.string() },
  async handler(ctx, args) {
    if (!ctx.auth.userId) throw ctx.error("UNAUTHENTICATED", "Sign in first.");
    const name = args.displayName.trim().slice(0, 80);
    if (!name) throw ctx.error("INVALID_ARGS", "Enter a display name.");
    await ctx.db.unsafe.update("User", ctx.auth.userId, { displayName: name });
    return { displayName: name };
  },
});
