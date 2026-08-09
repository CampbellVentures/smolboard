"use client";

import React, { useEffect, useState } from "react";
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
import { callFn } from "@pylonsync/react";
import { Building2, Mail } from "lucide-react";
import {
  DashboardEmptyState,
  DashboardPage,
  DashboardPanel,
  DashboardStatusBadge,
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
import { Label } from "@/components/ui/label";

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
    <DashboardPage>
      <DashboardEmptyState
        icon={Building2}
        title="No workspace yet"
        description="Create a private workspace for your events, speakers, and review team."
      >
        <Button asChild>
          <a href="/dashboard">Set up your workspace</a>
        </Button>
      </DashboardEmptyState>
    </DashboardPage>
  );
}

// Deterministic, timezone-independent date (UTC parts) so SSR and hydration
// agree — a locale/tz-dependent format would mismatch (React #418).
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
export function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export const isManager = (role: string) => role === "owner" || role === "admin";

export function RoleBadge({ role }: { role: string }) {
  return <DashboardStatusBadge status={role} />;
}

/* ============================= Members ============================ */

export interface OrgInfo {
  id: string;
  name: string;
  slug?: string;
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
  const [email, setEmail] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  async function load() {
    setMembers(await listOrgMembers(orgId));
    if (canManage) setInvites(await listInvites(orgId));
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
      await createInvite(orgId, value, "member");
      setEmail("");
      setNote(`Invite sent to ${value}.`);
      void load();
    } catch {
      setNote("Couldn't send that invite — check the address and your role.");
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

  return (
    <DashboardPage>
      <DashboardPanel
        title="Invite teammates"
        description="Add organizers and reviewers to this workspace."
        action={members ? <Count n={members.length} /> : null}
      >
        {canManage && (
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
            <Button type="submit" size="sm" disabled={inviting || !email.trim()}>
              {inviting ? "…" : "Invite"}
            </Button>
          </form>
        )}
        {note && <p className="mt-2 text-xs text-zinc-500">{note}</p>}

        <ul className="mt-3 divide-y divide-zinc-100">
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
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[12px] font-semibold text-zinc-600">
                      {initial}
                    </span>
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
                    <RoleBadge role={m.role} />
                  </li>
                );
              })}
        </ul>
        {!canManage && (
          <p className="mt-3 text-xs text-zinc-400">
            Only owners and admins can invite new members. Every member can review
            and score submissions.
          </p>
        )}
      </DashboardPanel>

      {canManage && invites && invites.length > 0 && (
        <DashboardPanel
          title="Pending invitations"
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
    </DashboardPage>
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
      window.location.reload();
    } catch {
      setError("Couldn't rename — only owners and admins can.");
      setSaving(false);
    }
  }

  return (
    <DashboardPage>
      <DashboardPanel title="Workspace" variant="subtle">
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

      <DashboardPanel title="Danger zone" variant="subtle">
        {canDelete ? (
          <DeleteOrg org={org} onDeleted={clearOrg} />
        ) : (
          <p className="text-sm text-zinc-500">
            Only the workspace owner can delete this workspace.
          </p>
        )}
      </DashboardPanel>
    </DashboardPage>
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
