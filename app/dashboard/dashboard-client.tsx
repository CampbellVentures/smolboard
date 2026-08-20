"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  createInvite,
  deleteOrg,
  listInvites,
  listOrgMembers,
  renameOrg,
  revokeInvite,
  useAuth,
  type OrgMember,
  type PendingInvite,
} from "@pylonsync/client";
import { callFn, useRouter } from "@pylonsync/react";
import { Building2, Mail, TriangleAlert, UserPlus, Users } from "lucide-react";
import {
  DashboardEmptyState,
  DashboardPage,
  DashboardPanel,
  DashboardStatusBadge,
  DashboardWidePage,
} from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PersonAvatar } from "@/components/person-avatar";
import { Label } from "@/components/ui/label";
import { isValidAccent, parseBranding } from "@/lib/branding";

// Shared workspace-level client views (Members, Settings) + small UI helpers
// reused across the dashboard. Event-specific views live under
// app/dashboard/events/.

export interface OrgMemberRow {
  id: string;
  orgId: string;
  userId: string;
  role: string;
}

export function NoOrg() {
  return (
    <DashboardWidePage>
      <DashboardEmptyState
        icon={Building2}
        title="No workspace yet"
        description="Create a private workspace for your events, speakers, and review team."
      >
        <Button asChild>
          <a href="/dashboard">Set up your workspace</a>
        </Button>
      </DashboardEmptyState>
    </DashboardWidePage>
  );
}

// Deterministic, timezone-independent date (UTC parts) so SSR and hydration
// agree — a locale/tz-dependent format would mismatch (React #418).
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
export { fmtDate } from "@/lib/format";

export const isManager = (role: string) => role === "owner" || role === "admin";

export function RoleBadge({ role }: { role: string }) {
  return <DashboardStatusBadge status={role} />;
}

/* ============================= Members ============================ */

export interface OrgInfo {
  id: string;
  name: string;
  slug?: string;
  brandingJson?: unknown;
  createdAt: string;
}

export function Members({
  tenantId,
  currentUserId,
  role,
}: {
  tenantId: string | null;
  currentUserId: string | null;
  role: string;
}) {
  if (!tenantId) return <NoOrg />;
  return <MembersList orgId={tenantId} currentUserId={currentUserId} role={role} />;
}

// The roster comes from the framework's members endpoint, which joins each
// member's email + name server-side. Invites are gated to owners/admins here
// AND on the server.
function MembersList({
  orgId,
  currentUserId,
  role,
}: {
  orgId: string;
  currentUserId: string | null;
  role: string;
}) {
  const canManage = isManager(role);
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [invites, setInvites] = useState<PendingInvite[] | null>(null);
  const [reviewerIds, setReviewerIds] = useState<Set<string>>(new Set());
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [note, setNote] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [togglingReviewer, setTogglingReviewer] = useState<string | null>(null);

  async function load() {
    setMembers(await listOrgMembers(orgId));
    if (canManage) {
      const [nextInvites, reviewerMemberships] = await Promise.all([
        listInvites(orgId),
        callFn<{ userId: string; status: string }[]>("listReviewerMemberships", { orgId }),
      ]);
      setInvites(nextInvites);
      setReviewerIds(new Set(reviewerMemberships.filter((membership) => membership.status === "active").map((membership) => membership.userId)));
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    setInviting(true);
    setNote(null);
    try {
      await createInvite(orgId, value, inviteRole);
      setEmail("");
      setNote(`Invite sent to ${value}.`);
      void load();
    } catch {
      setNote("Couldn't send that invite. Check the address and your role.");
    } finally {
      setInviting(false);
    }
  }

  async function revoke(inviteId: string) {
    setInvites((prev) => prev?.filter((i) => i.id !== inviteId) ?? null);
    try {
      await revokeInvite(orgId, inviteId);
    } finally {
      void load();
    }
  }

  async function toggleReviewer(userId: string) {
    const active = !reviewerIds.has(userId);
    setTogglingReviewer(userId);
    setNote(null);
    try {
      await callFn("setReviewerMembership", { orgId, userId, active });
      setReviewerIds((current) => {
        const next = new Set(current);
        if (active) next.add(userId);
        else next.delete(userId);
        return next;
      });
    } catch {
      // The old version updated local state whether or not the call landed, so
      // a failure showed as success until the next reload.
      setNote("Couldn't change reviewer access. Check your role and try again.");
    } finally {
      setTogglingReviewer(null);
    }
  }

  return (
    <DashboardWidePage>
      {/* Invite form and roster are separate panels. Sharing one made the
          member list a headless run of rows under the form, while invitations
          below it had a title — two lists in the same row style, one labeled,
          which reads as a single confusing list. */}
      {canManage && (
        <DashboardPanel
          title="Invite teammates"
          icon={UserPlus}
          tone="violet"
          description="Add organizers and reviewers to this workspace."
        >
          <form onSubmit={invite} className="flex max-w-xl flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="reviewer@yourteam.com…"
              aria-label="Invite email"
              autoComplete="email"
              spellCheck={false}
            />
            <Select
              aria-label="Invite role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-28 shrink-0"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </Select>
            <Button type="submit" size="sm" disabled={inviting || !email.trim()}>
              {inviting ? "…" : "Invite"}
            </Button>
          </form>
          {note && <p className="mt-2 text-xs text-zinc-500">{note}</p>}
        </DashboardPanel>
      )}

      <DashboardPanel
        title="Members"
        icon={Users}
        tone="sky"
        description="Everyone with access to this workspace."
        action={members ? <Count n={members.length} /> : null}
      >
        <ul className="divide-y divide-zinc-100">
          {members === null
            ? Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <div className="size-8 animate-pulse rounded-full bg-zinc-100" />
                  <div className="h-3 w-40 animate-pulse rounded bg-zinc-100" />
                </li>
              ))
            : members.map((m) => {
                const label = m.name || m.email || "Unknown member";
                const initial = (label.trim()[0] || "?").toUpperCase();
                const isMe = m.user_id === currentUserId;
                return (
                  <li key={m.user_id} className="flex items-center gap-3 py-2.5">
                    <PersonAvatar name={label} src={m.avatar_url} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-zinc-900">
                          {label}
                        </span>
                        {isMe && (
                          <Badge variant="secondary">You</Badge>
                        )}
                      </div>
                      {m.name && m.email && m.name !== m.email && (
                        <div className="truncate text-xs text-zinc-500">{m.email}</div>
                      )}
                    </div>
                    {reviewerIds.has(m.user_id) ? <Badge variant="outline">Reviewer</Badge> : null}
                    <RoleBadge role={m.role} />
                    {/* Owners and admins can review too, and on a small
                        program they usually do. Gating this on role === member
                        hid the control entirely in a workspace where everyone
                        is an organizer, leaving a Reviewer badge nobody could
                        change. The server has never restricted it that way. */}
                    {canManage ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={togglingReviewer === m.user_id}
                        onClick={() => void toggleReviewer(m.user_id)}
                      >
                        {reviewerIds.has(m.user_id) ? "Remove reviewer" : "Make reviewer"}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
        </ul>
        {!canManage && (
          <p className="mt-3 text-xs text-zinc-400">
            Only owners and admins can invite members or designate reviewers.
          </p>
        )}
      </DashboardPanel>

      {canManage && invites && invites.length > 0 && (
        <DashboardPanel
          title="Pending invitations"
          icon={Mail}
          tone="amber"
          action={<span className="text-xs tabular-nums text-muted-foreground">{invites.length} pending</span>}
        >
          <ul className="divide-y divide-zinc-100">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-zinc-300 text-zinc-400">
                  <Mail className="size-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-900">{inv.email}</div>
                  <div className="text-xs text-zinc-500">
                    Invited · expires {formatDate(unixToIso(inv.expires_at))}
                  </div>
                </div>
                <RoleBadge role={inv.role} />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => revoke(inv.id)}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </DashboardPanel>
      )}
    </DashboardWidePage>
  );
}

// PendingInvite.expires_at is unix SECONDS; formatDate() wants an ISO string.
function unixToIso(sec: number) {
  return new Date(sec * 1000).toISOString();
}

function Count({ n }: { n: number }) {
  return (
    <span className="text-xs tabular-nums text-muted-foreground">
      {n} {n === 1 ? "person" : "people"}
    </span>
  );
}

/* ============================ Settings ============================ */

// The public workspace index at /<org-slug> lists every event, and until now
// it rendered smolboard's own mark because Org had nowhere to carry the
// organizer's. Same accent + logo shape as an event's branding.
function OrgBrandingEditor({ org, canManage }: { org: OrgInfo; canManage: boolean }) {
  const initial = parseBranding(org.brandingJson);
  const [accent, setAccent] = useState(initial.accent ?? "");
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function persist(next: { accent: string; logoUrl: string }) {
    setBusy(true);
    setNote(null);
    try {
      await callFn("saveOrgBranding", {
        orgId: org.id,
        accent: next.accent.trim() || null,
        logoUrl: next.logoUrl.trim() || null,
      });
      setNote("Saved.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not save branding.");
    } finally {
      setBusy(false);
    }
  }

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setNote("Images must be 4 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const result = await callFn<{ url: string }>("uploadOrgImage", {
        orgId: org.id,
        filename: file.name,
        mimeType: file.type || "image/png",
        dataBase64: btoa(binary),
      });
      setLogoUrl(result.url);
      await persist({ accent, logoUrl: result.url });
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) return null;
  return (
    <div className="mt-5 border-t border-zinc-100 pt-4">
      <Label>Workspace logo</Label>
      <p className="mt-1 text-xs text-zinc-500">
        Shown on your public workspace page at /{org.slug ?? "<handle>"}.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          onBlur={() => void persist({ accent, logoUrl })}
          placeholder="https://yoursite.com/logo.svg…"
          aria-label="Workspace logo URL"
          autoComplete="off"
          spellCheck={false}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          className="hidden"
          onChange={onPick}
        />
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "Working…" : "Upload"}
        </Button>
      </div>
      {logoUrl.trim() ? (
        <div className="mt-3 flex h-16 items-center justify-between gap-3 rounded-lg border border-dashed bg-zinc-50 px-4">
          <img src={logoUrl} alt="Workspace logo preview" className="h-8 w-auto max-w-48 object-contain" />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setLogoUrl("");
              void persist({ accent, logoUrl: "" });
            }}
          >
            Remove
          </Button>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Label htmlFor="workspace-accent" className="text-xs text-zinc-500">Accent</Label>
        <Input
          id="workspace-accent"
          value={accent}
          onChange={(e) => setAccent(e.target.value)}
          onBlur={() => void persist({ accent, logoUrl })}
          placeholder="#7c3aed"
          className="w-32"
          autoComplete="off"
          spellCheck={false}
        />
        {accent.trim() && isValidAccent(accent.trim()) ? (
          <span className="size-5 rounded-full border" style={{ background: accent.trim() }} aria-hidden="true" />
        ) : null}
      </div>
      {note ? <p className="mt-2 text-xs text-zinc-500">{note}</p> : null}
    </div>
  );
}

export function Settings({
  org,
  role,
  memberCount,
}: {
  org: OrgInfo | null;
  role: string;
  memberCount: number;
}) {
  if (!org) return <NoOrg />;
  return <SettingsView org={org} role={role} memberCount={memberCount} />;
}

function SettingsView({
  org,
  role,
  memberCount,
}: {
  org: OrgInfo;
  role: string;
  memberCount: number;
}) {
  const router = useRouter();
  const { clearOrg } = useAuth();
  const [name, setName] = useState(org.name);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canManage = isManager(role);
  const canDelete = role === "owner";
  const dirty = name.trim() !== org.name && name.trim().length > 0;

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await renameOrg(org.id, name.trim());
      setSaved(true);
      router.refresh();
    } catch {
      setError("Only owners and admins can rename the workspace.");
      setSaving(false);
    }
  }

  return (
    <DashboardWidePage>
      <DashboardPanel title="Workspace" icon={Building2} tone="sky" variant="subtle">
        <form onSubmit={rename} className="flex max-w-xl flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workspace-name">Name</Label>
            <div className="flex items-center gap-2">
              <Input
                id="workspace-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSaved(false);
                }}
                disabled={!canManage}
              />
              {canManage && (
                <Button type="submit" size="sm" disabled={!dirty || saving}>
                  {saving ? "…" : "Save"}
                </Button>
              )}
            </div>
          </div>
          {saved && <p className="text-xs text-green-600">Workspace name updated.</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>

        <OrgSlugEditor org={org} canManage={canManage} />

        <OrgBrandingEditor org={org} canManage={canManage} />

        <dl className="mt-5 grid grid-cols-2 gap-y-3 border-t border-zinc-100 pt-4 text-sm">
          <dt className="text-zinc-500">Your role</dt>
          <dd className="text-right">
            <RoleBadge role={role} />
          </dd>
          <dt className="text-zinc-500">Members</dt>
          <dd className="text-right text-zinc-900">{memberCount}</dd>
          <dt className="text-zinc-500">Created</dt>
          <dd className="text-right text-zinc-900">{formatDate(org.createdAt)}</dd>
        </dl>
      </DashboardPanel>

      <DashboardPanel title="Danger zone" icon={TriangleAlert} tone="amber" variant="subtle">
        {canDelete ? (
          <DeleteOrg org={org} onDeleted={clearOrg} />
        ) : (
          <p className="text-sm text-zinc-500">
            Only the workspace owner can delete this workspace.
          </p>
        )}
      </DashboardPanel>
    </DashboardWidePage>
  );
}

// The workspace's public URL handle: /<handle>/<event>/… for every public
// event page. Renaming breaks previously shared links, so the helper says so.
function OrgSlugEditor({ org, canManage }: { org: OrgInfo; canManage: boolean }) {
  const [slug, setSlug] = useState(org.slug ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = slug.trim().toLowerCase() !== (org.slug ?? "") && slug.trim().length > 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await callFn("updateOrgSlug", { slug: slug.trim().toLowerCase() });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the handle.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-5 flex max-w-xl flex-col gap-1.5 border-t border-zinc-100 pt-4">
      <Label htmlFor="workspace-slug">URL handle</Label>
      <div className="flex items-center gap-2">
        <Input
          id="workspace-slug"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSaved(false);
          }}
          placeholder={org.slug ?? "my-workspace"}
          disabled={!canManage}
          spellCheck={false}
          autoComplete="off"
        />
        {canManage && (
          <Button type="submit" size="sm" disabled={!dirty || saving}>
            {saving ? "…" : "Save"}
          </Button>
        )}
      </div>
      <p className="text-xs text-zinc-400">
        Public event pages live at /{slug.trim().toLowerCase() || "<handle>"}/&lt;event&gt;.
        Changing it breaks links you have already shared.
      </p>
      {saved && <p className="text-xs text-green-600">Handle updated.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

function DeleteOrg({
  org,
  onDeleted,
}: {
  org: OrgInfo;
  onDeleted: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState("");
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const armed = confirm.trim() === org.name;

  async function remove() {
    if (!armed) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteOrg(org.id);
      await onDeleted();
      window.location.assign("/dashboard");
    } catch {
      setError("Delete failed. Try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-pretty text-sm text-muted-foreground">
        Deleting <span className="font-medium">{org.name}</span> removes its events,
        submissions, and speakers for everyone. This can&apos;t be undone.
      </p>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setConfirm("");
            setError(null);
          }
        }}
      >
        <AlertDialogTrigger asChild>
          <Button type="button" variant="destructive" className="shrink-0">
            Delete workspace
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{org.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes every event, submission, and speaker in the workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="confirm-workspace-name">
              Type {org.name} to confirm
            </FieldLabel>
            <Input
              id="confirm-workspace-name"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="off"
              aria-invalid={!!error}
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!armed || deleting}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              {deleting ? "Deleting…" : "Delete workspace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function formatDate(iso: string) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
