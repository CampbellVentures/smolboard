"use client";

import React, { useMemo, useState } from "react";
import { callFn } from "@pylonsync/react";
import { Button } from "@/components/ui/button";
import { FormRenderer } from "@/components/form-renderer";
import {
  parseFields,
  pruneAnswers,
  validateAnswers,
  type Answers,
  type ValidationError,
} from "@/lib/forms";
import { parseJson } from "@/lib/types";
import { CheckCircle2 } from "lucide-react";

// The public CFP form. Fixed speaker/talk fields (they feed User +
// SpeakerProfile + Submission columns) + the organizer's custom fields via the
// shared renderer. Client-side validation mirrors the server's — the server
// re-validates everything in submitCfp.

const inputCls =
  "h-8 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[13px] text-zinc-900 outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10";

export function CfpForm({
  formId,
  fieldsJson,
  confirmationMessage,
}: {
  formId: string;
  fieldsJson: unknown;
  confirmationMessage?: string;
}) {
  const fields = useMemo(() => {
    try {
      return parseFields(parseJson(fieldsJson) ?? []);
    } catch {
      return [];
    }
  }, [fieldsJson]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [topError, setTopError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTopError(null);
    const missing: ValidationError[] = [];
    if (!name.trim()) missing.push({ field: "speaker_name", message: "Your name is required." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      missing.push({ field: "speaker_email", message: "Enter a valid email." });
    }
    if (!title.trim()) missing.push({ field: "title", message: "A talk title is required." });
    const pruned = pruneAnswers(fields, answers);
    const fieldErrors = validateAnswers(fields, pruned);
    const all = [...missing, ...fieldErrors];
    setErrors(all);
    if (all.length > 0) {
      setTopError("Fix the highlighted fields and resubmit.");
      return;
    }
    setBusy(true);
    try {
      await callFn("submitCfp", {
        formId,
        name: name.trim(),
        email: email.trim(),
        title: title.trim(),
        abstract: abstract.trim() || undefined,
        answers: pruned,
      });
      setDone(true);
    } catch (err) {
      setTopError(err instanceof Error ? err.message : "Submission failed — try again.");
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="py-6 text-center">
        <CheckCircle2 className="mx-auto size-10 text-emerald-500" />
        <h2 className="mt-3 text-lg font-semibold text-zinc-900">Submission received</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-500">
          {confirmationMessage ||
            "Thanks! We emailed you a confirmation. Track your submission and complete your speaker profile in the portal."}
        </p>
        <a
          href="/portal"
          className="mt-5 inline-flex h-9 items-center rounded-lg bg-zinc-900 px-4 text-[13px] font-medium text-white hover:bg-zinc-700"
        >
          Open your speaker portal
        </a>
      </div>
    );
  }

  const errFor = (key: string) => errors.find((er) => er.field === key)?.message;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="block">
            <span className="mb-1.5 flex items-baseline gap-1 text-[13px] font-medium text-zinc-700">
              Your name<span className="text-red-500">*</span>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoComplete="name" />
          </label>
          {errFor("speaker_name") && <p className="mt-1 text-xs text-red-600">{errFor("speaker_name")}</p>}
        </div>
        <div>
          <label className="block">
            <span className="mb-1.5 flex items-baseline gap-1 text-[13px] font-medium text-zinc-700">
              Email<span className="text-red-500">*</span>
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              autoComplete="email"
            />
          </label>
          {errFor("speaker_email") && <p className="mt-1 text-xs text-red-600">{errFor("speaker_email")}</p>}
          <p className="mt-1 text-xs text-zinc-400">
            Your speaker portal login — confirmations and updates go here.
          </p>
        </div>
      </div>

      <div>
        <label className="block">
          <span className="mb-1.5 flex items-baseline gap-1 text-[13px] font-medium text-zinc-700">
            Talk title<span className="text-red-500">*</span>
          </span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </label>
        {errFor("title") && <p className="mt-1 text-xs text-red-600">{errFor("title")}</p>}
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">Abstract</span>
        <textarea
          value={abstract}
          onChange={(e) => setAbstract(e.target.value)}
          rows={5}
          className={inputCls + " resize-y"}
          placeholder="What will the audience learn?"
        />
      </label>

      {fields.length > 0 && (
        <FormRenderer fields={fields} answers={answers} onChange={setAnswers} errors={errors} />
      )}

      {topError && <p className="text-sm text-red-600">{topError}</p>}
      <Button type="submit" disabled={busy} className="w-full sm:w-auto">
        {busy ? "Submitting…" : "Submit talk"}
      </Button>
    </form>
  );
}
