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
  return (
    <p className="mt-2 text-sm text-zinc-500" data-cfp-window={state}>
      {state === "upcoming"
        ? `Submissions open ${opensLabel ?? "soon"}.`
        : state === "closed"
          ? `Submissions are closed${closesLabel ? ` as of ${closesLabel}` : ""}.`
          : closesLabel
            ? `Submit by ${closesLabel}.`
            : "Submissions are open."}
    </p>
  );
}
