import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { CfpForm } from "./cfp-form";
import { PublicEventShell } from "@/components/public-shell";
import { publicEventInfo, resolvePublicEvent } from "@/lib/public-site";
import type { EventRow, OrgRow, SubmissionFormRow } from "@/lib/types";
import { cfpWindowState, formatCfpInstant } from "@/lib/cfp-window";
import { CfpWindowNotice } from "./cfp-window-notice";

export const metadata: Metadata = {
  title: "Submit a talk",
};

// Public submission form: /<org-slug>/<event-slug>/cfp/<form-slug>. SSR
// resolves the event + form definition (open forms are policy-readable
// anonymously); the form itself is a client component so conditional logic
// reacts as you type.
export default function CfpFormPage({
  auth,
  params,
  response,
  serverData,
}: PageProps<{ orgSlug: string; eventSlug: string; formSlug: string }>) {
  const orgsPromise = serverData.list<OrgRow>("Org");
  const eventsPromise = serverData.list<EventRow>("Event");
  const formsPromise = serverData.list<SubmissionFormRow>("SubmissionForm");
  const resolved = resolvePublicEvent(
    use(orgsPromise),
    use(eventsPromise),
    params.orgSlug,
    params.eventSlug,
  );
  if (!resolved) {
    response.notFound();
    return null;
  }
  const { org, event } = resolved;
  const form = use(formsPromise).find(
    (f) => f.eventId === event.id && f.slug === params.formSlug,
  );
  if (!form || form.status === "draft") {
    response.notFound();
    return null;
  }
  const windowState = cfpWindowState({
    eventStatus: event.cfpStatus,
    formStatus: form.status,
    opensAt: form.opensAt,
    closesAt: form.closesAt,
  });
  const deadline = formatCfpInstant(form.closesAt, event.timezone);

  return (
    <PublicEventShell event={publicEventInfo(org, event)} active="cfp">
      <h2 className="text-xl font-semibold tracking-tight text-zinc-900">{form.name}</h2>
      {form.description && (
        <p className="mt-2 text-[15px] leading-relaxed text-zinc-600">{form.description}</p>
      )}
      <CfpWindowNotice
        state={windowState}
        opensLabel={formatCfpInstant(form.opensAt, event.timezone)}
        closesLabel={deadline}
      />
      <div className="mt-6 rounded-xl bg-white p-6 shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)] sm:p-8">
        <CfpForm
          formId={form.id}
          fieldsJson={form.fieldsJson}
          confirmationMessage={form.confirmationMessage}
          signedIn={Boolean(auth.user_id)}
          windowState={windowState}
        />
      </div>
    </PublicEventShell>
  );
}
