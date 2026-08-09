"use client";

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";

type State =
  | { kind: "working" }
  | { kind: "done"; orgName?: string }
  | { kind: "signed-out" }
  | { kind: "error"; message: string };

export function AcceptInvite({ token, signedIn }: { token: string; signedIn: boolean }) {
  const [state, setState] = useState<State>(signedIn ? { kind: "working" } : { kind: "signed-out" });

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    fetch(`/api/auth/invites/${encodeURIComponent(token)}/accept`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (response) => {
        if (!active) return;
        if (response.ok) {
          const body = (await response.json().catch(() => ({}))) as { org_name?: string };
          setState({ kind: "done", orgName: body.org_name });
          setTimeout(() => window.location.assign("/dashboard"), 1200);
        } else {
          const body = (await response.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          setState({
            kind: "error",
            message:
              body.error?.message ??
              "This invite may have expired, been revoked, or belong to a different email.",
          });
        }
      })
      .catch(() => active && setState({ kind: "error", message: "Network error — try again." }));
    return () => {
      active = false;
    };
  }, [token, signedIn]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 text-center">
        <BrandMark size={40} className="mx-auto" />
        {state.kind === "working" && (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-zinc-600">
            <Loader2 className="size-4 animate-spin" /> Accepting your invite…
          </p>
        )}
        {state.kind === "done" && (
          <>
            <h1 className="mt-4 text-lg font-semibold text-zinc-900">You're in</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {state.orgName ? `Welcome to ${state.orgName}. ` : ""}Taking you to the dashboard…
            </p>
          </>
        )}
        {state.kind === "signed-out" && (
          <>
            <h1 className="mt-4 text-lg font-semibold text-zinc-900">Sign in to accept</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Sign in with the email this invite was sent to, then come back to this link.
            </p>
            <Button asChild className="mt-5 w-full">
              <a href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in</a>
            </Button>
          </>
        )}
        {state.kind === "error" && (
          <>
            <h1 className="mt-4 text-lg font-semibold text-zinc-900">Couldn't accept invite</h1>
            <p className="mt-1 text-sm text-zinc-500">{state.message}</p>
          </>
        )}
      </div>
    </div>
  );
}
