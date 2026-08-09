import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { CfpForm } from "./cfp-form";
import { BrandMark } from "@/components/brand";
import type { EventRow, SubmissionFormRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Submit a talk",
};

// Public submission form: /cfp/[eventSlug]/[formSlug]. SSR resolves the event
// + form definition (open forms are policy-readable anonymously); the form
// itself is a client component so conditional logic reacts as you type.
export default function CfpFormPage({
  params,
  response,
  serverData,
}: PageProps<{ eventSlug: string; formSlug: string }>) {
  const events = use(serverData.list<EventRow>("Event"));
  const event = events.find((e) => e.slug === params.eventSlug);
  if (!event) {
    response.notFound();
    return null;
  }
  const forms = use(serverData.list<SubmissionFormRow>("SubmissionForm"));
  const form = forms.find((f) => f.eventId === event.id && f.slug === params.formSlug);
  if (!form || form.status !== "open" || event.cfpStatus !== "open") {
    response.notFound();
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <a
          href={`/cfp/${event.slug}`}
          className="flex w-fit items-center gap-2 text-[13px] font-medium text-zinc-400 transition-colors hover:text-zinc-700"
        >
          <BrandMark size={18} /> ← {event.name}
        </a>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{form.name}</h1>
        {form.description && (
          <p className="mt-2 text-[15px] leading-relaxed text-zinc-600">{form.description}</p>
        )}
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 sm:p-8">
          <CfpForm
            formId={form.id}
            fieldsJson={form.fieldsJson}
            confirmationMessage={form.confirmationMessage}
          />
        </div>
      </div>
      <footer className="mx-auto flex max-w-2xl items-center justify-center gap-1.5 px-6 pb-10 text-xs text-zinc-400">
        <BrandMark size={14} />
        <a href="/" className="transition-colors hover:text-zinc-900">Powered by smolboard</a>
      </footer>
    </div>
  );
}
