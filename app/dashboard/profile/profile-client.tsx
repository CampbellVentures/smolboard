"use client";

import React, { useState } from "react";
import { useAuth, changePassword, ApiError } from "@pylonsync/client";
import { KeyRound, UserRound } from "lucide-react";
import { toast } from "sonner";
import { callFn } from "@pylonsync/react";
import { DashboardPage, DashboardPanel } from "@/components/dashboard";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtDate } from "@/lib/format";

// Account settings for the signed-in organizer. Email is identity and stays
// read-only; the display name is what teammates and speakers see on activity
// and notes.
export function ProfileClient({
  email,
  displayName,
  joinedAt,
}: {
  email: string;
  displayName: string;
  joinedAt: string | null;
}) {
  const { session } = useAuth();
  const avatarUrl = (session as { avatarUrl?: string | null } | null)?.avatarUrl ?? null;
  const [name, setName] = useState(displayName);
  const [savingName, setSavingName] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    setSavingName(true);
    try {
      await callFn("updateMyProfile", { displayName: name });
      toast.success("Profile updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save your profile.");
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setSavingPassword(true);
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      toast.success("Password changed");
    } catch (error) {
      const message =
        error instanceof ApiError && error.code === "INVALID_CREDENTIALS"
          ? "That current password is wrong."
          : error instanceof ApiError && error.code === "WEAK_PASSWORD"
            ? "Pick a longer password, at least 10 characters."
            : error instanceof Error
              ? error.message
              : "Couldn't change your password.";
      toast.error(message);
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <DashboardPage>
      <div className="flex items-center gap-4">
        <PersonAvatar name={displayName || email} src={avatarUrl} size="xl" />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight">
            {displayName || email.split("@")[0]}
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            {email}
            {joinedAt ? ` · joined ${fmtDate(joinedAt)}` : ""}
          </p>
        </div>
      </div>

      <DashboardPanel
        title="Your details"
        description="Your display name appears on activity, comments, and speaker notes."
        icon={UserRound}
        tone="violet"
        variant="subtle"
      >
        <form onSubmit={saveName} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-name">Display name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={email} readOnly disabled />
            <p className="text-xs text-muted-foreground">
              Your email is your sign-in identity and can&apos;t be changed here.
            </p>
          </div>
          <Button type="submit" size="sm" disabled={savingName || !name.trim()} className="self-start">
            {savingName ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </DashboardPanel>

      <DashboardPanel
        title="Password"
        description="Used with email sign-in. Signing in with Google doesn't need one."
        icon={KeyRound}
        tone="amber"
        variant="subtle"
      >
        <form onSubmit={savePassword} className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={savingPassword || !current || next.length < 10}
            className="self-start"
          >
            {savingPassword ? "Changing…" : "Change password"}
          </Button>
        </form>
      </DashboardPanel>
    </DashboardPage>
  );
}
