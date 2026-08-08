"use client";

import React, { useEffect, useState } from "react";
import { db } from "@pylonsync/react";
import { sendMagicLink, verifyMagicLink, useAuth } from "@pylonsync/client";
import { Button } from "@/components/ui/button";
import { Mic2, LogOut, Loader2 } from "lucide-react";
import type { EventRow, SpeakerProfileRow, SubmissionRow } from "@/lib/types";

const inputCls =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

/* ============================= Login ============================= */

// Passwordless: email → 6-digit code → session. The account already exists if
// the speaker ever submitted a CFP; verify also auto-creates one, so this
// screen never dead-ends.
export function PortalLogin() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendMagicLink(email.trim().toLowerCase());
      setStage("code");
    } catch {
      setError("Couldn't send a code — check the address and try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyMagicLink(email.trim().toLowerCase(), code.trim());
      window.location.reload();
    } catch {
      setError("That code didn't work — it may have expired. Request a new one.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-zinc-900 text-white">
            <Mic2 className="size-5" />
          </span>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-zinc-900">
            Speaker portal
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sign in with the email you used to submit. No password — we email you a
            code.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          {stage === "email" ? (
            <form onSubmit={sendCode} className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">Email</span>
                <input
                  type="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputCls}
                />
              </label>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <Button type="submit" disabled={busy || !email.trim()} className="w-full">
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Email me a code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-3">
              <p className="text-sm text-zinc-600">
                We sent a 6-digit code to <span className="font-medium">{email}</span>.
              </p>
              <input
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                aria-label="Sign-in code"
                className={inputCls + " text-center text-lg tracking-[0.4em]"}
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStage("email");
                  setCode("");
                  setError(null);
                }}
                className="w-full text-center text-xs font-medium text-zinc-400 hover:text-zinc-700"
              >
                Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================= Home ============================= */

function statusTone(status: string) {
  switch (status) {
    case "accepted":
      return "bg-emerald-50 text-emerald-600";
    case "rejected":
      return "bg-red-50 text-red-500";
    case "waitlisted":
      return "bg-amber-50 text-amber-700";
    case "withdrawn":
      return "bg-zinc-100 text-zinc-400";
    default:
      return "bg-blue-50 text-blue-600";
  }
}
function statusLabel(status: string) {
  return status === "submitted" ? "in review" : status.replace("_", " ");
}

export function PortalHome({
  userId,
  email,
  initialProfiles,
  initialSubmissions,
  events,
}: {
  userId: string;
  email: string;
  initialProfiles: SpeakerProfileRow[];
  initialSubmissions: SubmissionRow[];
  events: EventRow[];
}) {
  const { signOut } = useAuth();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  // Live: status flips (accepted!) appear without a refresh.
  const subsQ = db.useQuery<SubmissionRow>("Submission");
  const profQ = db.useQuery<SpeakerProfileRow>("SpeakerProfile");
  const submissions =
    !hydrated || subsQ.loading
      ? initialSubmissions
      : subsQ.data.filter((s) => s.speakerUserId === userId);
  const profiles =
    !hydrated || profQ.loading
      ? initialProfiles
      : profQ.data.filter((p) => p.userId === userId);

  const eventName = (id: string) => events.find((e) => e.id === id)?.name ?? "Event";

  async function onSignOut() {
    await signOut();
    window.location.reload();
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-zinc-900">
            <Mic2 className="size-4 text-zinc-400" /> Speaker portal
          </span>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-zinc-400 sm:block">{email}</span>
            <button
              type="button"
              onClick={onSignOut}
              className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-800"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-6 py-10">
        {submissions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
            <p className="text-sm font-medium text-zinc-700">No submissions yet</p>
            <p className="mt-1 text-sm text-zinc-400">
              Submit to an open call for speakers and it will show up here.
            </p>
          </div>
        ) : (
          <section>
            <h2 className="text-sm font-semibold text-zinc-900">Your submissions</h2>
            <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
              {submissions
                .slice()
                .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
                .map((s) => (
                  <li key={s.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-zinc-900">{s.title}</div>
                      <div className="mt-0.5 text-xs text-zinc-400">{eventName(s.eventId)}</div>
                    </div>
                    <span
                      className={
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize " +
                        statusTone(s.status)
                      }
                    >
                      {statusLabel(s.status)}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        )}

        {profiles.map((p) => (
          <ProfileEditor key={p.id} profile={p} eventName={eventName(p.eventId)} />
        ))}
      </main>
    </div>
  );
}

/* ========================= Profile editor ========================= */

// Speakers own their SpeakerProfile row (policy: auth.userId == data.userId),
// so edits are direct db.updates — live for the organizer's dashboard too.
function ProfileEditor({
  profile,
  eventName,
}: {
  profile: SpeakerProfileRow;
  eventName: string;
}) {
  const [name, setName] = useState(profile.name);
  const [tagline, setTagline] = useState(profile.tagline ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [company, setCompany] = useState(profile.company ?? "");
  const [jobTitle, setJobTitle] = useState(profile.jobTitle ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await db.update("SpeakerProfile", profile.id, {
        name: name.trim(),
        tagline: tagline.trim() || undefined,
        bio: bio.trim() || undefined,
        company: company.trim() || undefined,
        jobTitle: jobTitle.trim() || undefined,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const completeness = [name, tagline, bio, company].filter((v) => v.trim()).length;

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">
          Speaker profile · {eventName}
        </h2>
        <span className="text-xs text-zinc-400">{completeness}/4 complete</span>
      </div>
      <form onSubmit={save} className="mt-3 space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">Name</span>
            <input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">Tagline</span>
            <input
              value={tagline}
              onChange={(e) => { setTagline(e.target.value); setSaved(false); }}
              placeholder="One line about you, shown under your name."
              className={inputCls}
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">Company</span>
            <input value={company} onChange={(e) => { setCompany(e.target.value); setSaved(false); }} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">Role</span>
            <input value={jobTitle} onChange={(e) => { setJobTitle(e.target.value); setSaved(false); }} className={inputCls} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">Bio</span>
          <textarea
            value={bio}
            onChange={(e) => { setBio(e.target.value); setSaved(false); }}
            rows={4}
            placeholder="Written in third person, used in the program and on the website."
            className={inputCls + " resize-y"}
          />
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
          {saved && <span className="text-xs text-emerald-600">Saved.</span>}
        </div>
      </form>
    </section>
  );
}
