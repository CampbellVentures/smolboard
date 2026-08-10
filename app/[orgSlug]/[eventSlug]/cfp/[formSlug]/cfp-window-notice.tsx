import React from "react";
import type { CfpWindowState } from "@/lib/cfp-window";

export function CfpWindowNotice({
  state,
  opensLabel,
  closesLabel,
}: {
  state: CfpWindowState;
  opensLabel?: string;
  closesLabel?: string;
}) {
  // An open call with a real deadline gets a banner — the deadline is the
  // single most important fact on this page. Other states stay quiet lines.
  if (state === "open" && closesLabel) {
    return (
      <p
        className="mt-3 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-center text-[13px] font-medium text-zinc-700"
        data-cfp-window={state}
      >
        Submissions will be accepted until {closesLabel}.
      </p>
    );
  }
  return (
    <p className="mt-2 text-sm text-zinc-500" data-cfp-window={state}>
      {state === "upcoming"
        ? `Submissions open ${opensLabel ?? "soon"}.`
        : state === "closed"
          ? `Submissions are closed${closesLabel ? ` as of ${closesLabel}` : ""}.`
          : "Submissions are open."}
    </p>
  );
}
