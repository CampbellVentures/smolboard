"use client";

import React, { useEffect, useMemo, useState } from "react";
import { callFn } from "@pylonsync/react";

import { sendMagicLink, verifyMagicLink, passwordRegister, persistSession } from "@pylonsync/client";
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

// The submitter never needs this: they sign back in with an emailed code, which
// proves the inbox. It exists only because registration takes a password.
function throwawayPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `Cfp-${Array.from(bytes, (b) => b.toString(36)).join("")}`;
}

const inputCls =
  "h-8 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[13px] text-zinc-900 outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10";

export function CfpForm({
  formId,
  fieldsJson,
  confirmationMessage,
  signedIn,
  windowState,
}: {
  formId: string;
  fieldsJson: unknown;
  confirmationMessage?: string;
  signedIn: boolean;
  windowState: "upcoming" | "open" | "closed";
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
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [authStage, setAuthStage] = useState<"idle" | "code">("idle");
  const [code, setCode] = useState("");
  const [participants, setParticipants] = useState<Array<{ id: string; name: string; email: string; roleLabel: string; status: string }>>([]);
  const [participantName, setParticipantName] = useState("");
  const [participantEmail, setParticipantEmail] = useState("");
  const [participantRole, setParticipantRole] = useState("Co-presenter");
  const [authenticated, setAuthenticated] = useState(signedIn);

  useEffect(() => {
    if (!authenticated) return;
    void callFn<Array<{ id: string; name: string; title: string; abstract?: string; answersJson?: Answers; lifecycle: string }>>(
      "listMyCfpDrafts",
      { formId },
    ).then((drafts) => {
      const draft = drafts.find((candidate) => candidate.lifecycle === "draft");
      if (!draft) return;
      setDraftId(draft.id);
      setName(draft.name);
      setTitle(draft.title);
      setAbstract(draft.abstract ?? "");
      setAnswers(draft.answersJson ?? {});
      void loadParticipants(draft.id);
    }).catch(() => {});
  }, [authenticated, formId]);

  async function loadParticipants(id: string) {
    const rows = await callFn<typeof participants>("listDraftParticipants", { draftId: id });
    setParticipants(rows);
  }

  async function persistDraft(finalize: boolean) {
    const result = await callFn<{ id: string }>("saveCfpDraft", {
      formId,
      draftId: draftId || undefined,
      name: name.trim(),
      title: title.trim(),
      abstract: abstract.trim() || undefined,
      answers: pruneAnswers(fields, answers),
    });
    setDraftId(result.id);
    if (finalize) {
      await callFn("finalizeCfpDraft", { draftId: result.id });
      setDone(true);
    }
    return result.id;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTopError(null);
    setNeedsLogin(false);
    const missing: ValidationError[] = [];
    if (!name.trim()) missing.push({ field: "speaker_name", message: "Your name is required." });
    if (!authenticated && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
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
      if (!authenticated && authStage === "idle") {
        // A call for speakers is open to anyone, so a brand-new address gets an
        // account right here and submits. An address that ALREADY has an
        // account cannot be claimed this way: registration fails and we fall
        // back to the emailed code, so this is never a takeover path.
        const address = email.trim().toLowerCase();
        try {
          const session = await passwordRegister({ email: address, password: throwawayPassword() });
          persistSession(session);
          setAuthenticated(true);
          await persistDraft(true);
        } catch {
          await sendMagicLink(address);
          setAuthStage("code");
          setTopError("That email already has an account. Enter the emailed code to continue.");
          setBusy(false);
        }
      } else if (authenticated) {
        await persistDraft(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submission failed. Try again.";
      setTopError(message);
      setNeedsLogin(message.includes("speaker account"));
      setBusy(false);
    }
  }

  async function verifyAndSave(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setTopError(null);
    try {
      await verifyMagicLink(email.trim().toLowerCase(), code.trim());
      setAuthenticated(true);
      await persistDraft(false);
      setAuthStage("idle");
      setTopError("Email verified. Your draft is saved; invite any co-presenters, then finalize when ready.");
    } catch (error) {
      setTopError(error instanceof Error ? error.message : "Could not verify and finalize the submission.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    setBusy(true);
    setTopError(null);
    try {
      await persistDraft(false);
    } catch (error) {
      setTopError(error instanceof Error ? error.message : "Could not save this draft.");
    } finally {
      setBusy(false);
    }
  }

  async function inviteParticipant() {
    if (!draftId) return;
    setBusy(true);
    try {
      await callFn("inviteSubmissionParticipant", {
        draftId,
        name: participantName,
        email: participantEmail,
        roleLabel: participantRole,
      });
      setParticipantName("");
      setParticipantEmail("");
      await loadParticipants(draftId);
    } catch (error) {
      setTopError(error instanceof Error ? error.message : "Could not invite this participant.");
    } finally {
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

  if (windowState !== "open") {
    return <p className="py-8 text-center text-sm text-zinc-500">This CFP is {windowState === "upcoming" ? "not open yet" : "closed"}. Existing submissions remain available in the speaker portal.</p>;
  }

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

      {topError && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-red-600">{topError}</p>
          {needsLogin ? (
            <Button asChild type="button" size="sm" variant="outline">
              <a href="/portal">Sign in</a>
            </Button>
          ) : null}
        </div>
      )}
      {authStage === "code" && !authenticated ? (
        <div className="rounded-lg border p-4">
          <label className="block text-sm font-medium">Verification code</label>
          <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} maxLength={6} className={inputCls + " mt-2"} />
          <Button type="button" disabled={busy || code.length !== 6} onClick={(event) => void verifyAndSave(event)} className="mt-3">Verify and continue</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {authenticated ? <Button type="button" variant="outline" disabled={busy || !title.trim()} onClick={() => void saveDraft()}>Save draft</Button> : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Working…" : authenticated ? "Finalize submission" : "Submit proposal"}
          </Button>
        </div>
      )}

      {authenticated && draftId ? (
        <section className="rounded-lg border p-4">
          <h3 className="text-sm font-semibold">Co-presenters</h3>
          <p className="mt-1 text-xs text-zinc-500">Every invited participant must verify the exact invited email before finalization.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <input value={participantName} onChange={(event) => setParticipantName(event.target.value)} placeholder="Name" className={inputCls} />
            <input type="email" value={participantEmail} onChange={(event) => setParticipantEmail(event.target.value)} placeholder="Email" className={inputCls} />
            <input value={participantRole} onChange={(event) => setParticipantRole(event.target.value)} placeholder="Role" className={inputCls} />
          </div>
          <Button type="button" size="sm" variant="outline" className="mt-2" disabled={busy || !participantName || !participantEmail || !participantRole} onClick={() => void inviteParticipant()}>Invite participant</Button>
          {participants.length > 0 ? <ul className="mt-3 text-xs text-zinc-600">{participants.map((participant) => <li key={participant.id}>{participant.name} · {participant.roleLabel} · {participant.status}</li>)}</ul> : null}
        </section>
      ) : null}
    </form>
  );
}
