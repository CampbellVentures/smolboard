import React, { use } from "react";
import { type GenerateMetadata, type PageProps } from "@pylonsync/react";
import { CfpForm } from "./cfp-form";
import { PublicEventShell } from "@/components/public-shell";
import { publicEventInfo, resolvePublicEvent } from "@/lib/public-site";
import type { EventRow, OrgRow, SpeakerProfileRow, SubmissionFormRow } from "@/lib/types";
import { cfpWindowState, formatCfpInstant } from "@/lib/cfp-window";
import { CfpWindowNotice } from "./cfp-window-notice";

// This is the URL an organizer pastes into Slack, a newsletter, or a tweet.
// It was titled "Submit a talk" with no description and no card, so every
// share looked like a broken link to nowhere in particular.
export const generateMetadata: GenerateMetadata<{
  orgSlug: string;
  eventSlug: string;
  formSlug: string;
}> = async ({ params, serverData }) => {
  const [orgs, events, forms] = await Promise.all([
    serverData.list<OrgRow>("Org"),
    serverData.list<EventRow>("Event"),
    serverData.list<SubmissionFormRow>("SubmissionForm"),
  ]);
  const resolved = resolvePublicEvent(orgs, events, params.orgSlug, params.eventSlug);
  if (!resolved) return { title: "Not found", robots: "noindex" };
  const { org, event } = resolved;
  const form = forms.find((f) => f.eventId === event.id && f.slug === params.formSlug);
  const title = form ? `${form.name} · ${event.name}` : `Submit a talk · ${event.name}`;
  const description =
    form?.description?.trim() ||
    `Submit a talk to ${event.name}${event.location ? ` in ${event.location}` : ""}.`;
  return { title, description, openGraph: { title: form?.name ?? "Submit a talk", description } };
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
  // A signed-in speaker should not retype what the session already proves.
  // These were blank, so submitting meant filling in your own name and email
  // again, and leaving either one failed the save after the rest was written.
  const me = auth.user_id
    ? use(serverData.get<{ email?: string; displayName?: string }>("User", auth.user_id))
    : null;
  // displayName is the sign-up address on accounts that never set one, and an
  // email is not a name. The speaker's own profile for this event is the real
  // source; the account name is the fallback, and only when it reads like one.
  const myProfile = auth.user_id
    ? use(serverData.list<SpeakerProfileRow>("SpeakerProfile")).find(
        (p) => p.userId === auth.user_id && p.eventId === event.id,
      )
    : undefined;
  const accountName = me?.displayName?.includes("@") ? "" : me?.displayName ?? "";
  const initialName = myProfile?.name || accountName;

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
          initialName={initialName}
          initialEmail={me?.email ?? ""}
          windowState={windowState}
        />
      </div>
    </PublicEventShell>
  );
}
