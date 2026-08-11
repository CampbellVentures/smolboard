"use client";

import React, { useMemo, useState } from "react";
import { callFn } from "@/lib/fn";

import {
  DashboardIconChip,
  DashboardPanel,
  DashboardWidePage,
  type DashboardChipTone,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormRenderer } from "@/components/form-renderer";
import {
  keyFromLabel,
  parseFields,
  parseRouting,
  slugify,
  type Answers,
  type FieldType,
  type FormField,
  type RoutingConfig,
  type RoutingRule,
  type ShowIfOp,
  type ShowIfRule,
} from "@/lib/forms";
import { parseJson } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useOrgSlug } from "@/components/use-org-slug";
import { utcToZonedInput, zonedInputToUtc } from "@/lib/cfp-window";
import {
  mappingSourceValues,
  parseHandoffConfig,
  type SubmissionHandoffConfig,
} from "@/lib/submission-handoff";
import type { SubmissionRow, TrackRow } from "@/lib/types";
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  FileText,
  Gauge,
  MessageSquare,
  Split,
  type LucideIcon,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Type,
  AlignLeft,
  List,
  ListChecks,
  CheckSquare,
  Mail,
  Link2,
  Heading2,
} from "lucide-react";

// The form builder: field list + settings on the left, always-live preview on
// the right (the SAME FormRenderer the public CFP page uses, so the preview is
// the truth). Editing is local state; Save persists fieldsJson/routingJson.

const PALETTE: { type: FieldType; label: string; Icon: typeof Type }[] = [
  { type: "short_text", label: "Short text", Icon: Type },
  { type: "long_text", label: "Long text", Icon: AlignLeft },
  { type: "select", label: "Dropdown", Icon: List },
  { type: "multiselect", label: "Multi-select", Icon: ListChecks },
  { type: "checkbox", label: "Checkbox", Icon: CheckSquare },
  { type: "email", label: "Email", Icon: Mail },
  { type: "url", label: "URL", Icon: Link2 },
  { type: "section", label: "Section header", Icon: Heading2 },
];

const OPS: { value: ShowIfOp; label: string }[] = [
  { value: "equals", label: "is" },
  { value: "not_equals", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "is_answered", label: "is answered" },
];

export function FormBuilder({
  event,
  form,
  tracks,
  submissions,
}: {
  event: { id: string; slug: string; orgId: string; timezone: string };
  form: {
    id: string;
    name: string;
    slug: string;
    description?: string;
    status: string;
    fieldsJson?: unknown;
    routingJson?: unknown;
    confirmationMessage?: string;
    opensAt?: string;
    closesAt?: string;
    handoffMappingsJson?: unknown;
  };
  tracks: TrackRow[];
  submissions: SubmissionRow[];
}) {
  const orgSlug = useOrgSlug(event.orgId);
  const [name, setName] = useState(form.name);
  const [description, setDescription] = useState(form.description ?? "");
  const [confirmation, setConfirmation] = useState(form.confirmationMessage ?? "");
  const [status, setStatus] = useState(form.status);
  const [opensAt, setOpensAt] = useState(() => utcToZonedInput(form.opensAt, event.timezone));
  const [closesAt, setClosesAt] = useState(() => utcToZonedInput(form.closesAt, event.timezone));
  const [handoff, setHandoff] = useState<SubmissionHandoffConfig>(() =>
    parseHandoffConfig(parseJson(form.handoffMappingsJson)) ?? {
      formatFieldKey: null,
      formatValues: {},
      trackFieldKey: null,
      trackValues: {},
    }
  );
  const [fields, setFields] = useState<FormField[]>(() => {
    try {
      return parseFields(parseJson(form.fieldsJson) ?? []);
    } catch {
      return [];
    }
  });
  const [routing, setRouting] = useState<RoutingConfig>(() => {
    try {
      return (
        parseRouting(parseJson(form.routingJson)) ?? { rules: [] }
      );
    } catch {
      return { rules: [] };
    }
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [addingField, setAddingField] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const takenKeys = useMemo(() => new Set(fields.map((f) => f.key)), [fields]);

  function addField(type: FieldType) {
    const label = type === "section" ? "New section" : "New question";
    const f: FormField = {
      key: keyFromLabel(label, takenKeys),
      type,
      label,
      ...(type === "select" || type === "multiselect" ? { options: ["Option 1", "Option 2"] } : {}),
    };
    setFields((prev) => [...prev, f]);
    setSelected(f.key);
  }

  function patchField(key: string, patch: Partial<FormField>) {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  function removeField(key: string) {
    setFields((prev) => prev.filter((f) => f.key !== key));
    // Drop showIf/routing references to the removed field so rules never point
    // at nothing.
    setFields((prev) =>
      prev.map((f) =>
        f.showIf?.some((r) => r.field === key)
          ? { ...f, showIf: f.showIf.filter((r) => r.field !== key) }
          : f,
      ),
    );
    setRouting((r) => ({ ...r, rules: r.rules.filter((rule) => rule.field !== key) }));
    if (selected === key) setSelected(null);
  }

  function move(key: string, dir: -1 | 1) {
    setFields((prev) => {
      const i = prev.findIndex((f) => f.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await callFn("saveSubmissionForm", {
        eventId: event.id,
        formId: form.id,
        name: name.trim() || form.name,
        slug: slugify(name.trim() || form.name),
        description: description.trim() || undefined,
        confirmationMessage: confirmation.trim() || undefined,
        status,
        opensAt: zonedInputToUtc(opensAt, event.timezone),
        closesAt: zonedInputToUtc(closesAt, event.timezone),
        fieldsJson: fields,
        routingJson: routing,
        handoffMappingsJson: handoff,
      });
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardWidePage className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ---------------- Left: settings + field list ---------------- */}
      <div className="flex flex-col gap-5">
        <DashboardPanel title="Form details" icon={FileText} tone="violet" variant="subtle">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Form name"
              autoComplete="off"
            />
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-auto"
              aria-label="Form status"
            >
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </Select>
          </div>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Intro text shown above the form…"
            className="mt-3 resize-none"
            aria-label="Form description"
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-zinc-600">Opens ({event.timezone})<Input type="datetime-local" className="mt-1" value={opensAt} onChange={(event) => setOpensAt(event.target.value)} /></label>
            <label className="text-xs font-medium text-zinc-600">Closes ({event.timezone})<Input type="datetime-local" className="mt-1" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} /></label>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span
              className="min-w-0 truncate text-xs text-zinc-400"
              title={`/${orgSlug ?? "…"}/${event.slug}/cfp/${slugify(name) || form.slug}`}
            >
              Public URL: /{orgSlug ?? "…"}/{event.slug}/cfp/{slugify(name) || form.slug}
            </span>
            <div className="flex items-center gap-3">
              {savedAt && !saving && <span className="text-xs text-emerald-600">Saved</span>}
              <Button type="button" size="sm" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save form"}
              </Button>
            </div>
          </div>
        </DashboardPanel>

        <DashboardPanel
          title="Fields"
          icon={ListChecks}
          tone="sky"
          description="Name, email, title, and abstract are always collected. Add your custom questions here."
          variant="subtle"
        >
          <ul className="mt-3 space-y-2">
            {fields.map((f, i) => (
              <FieldEditor
                key={f.key}
                field={f}
                allFields={fields}
                index={i}
                count={fields.length}
                open={selected === f.key}
                onToggle={() => setSelected(selected === f.key ? null : f.key)}
                onPatch={(patch) => patchField(f.key, patch)}
                onRemove={() => removeField(f.key)}
                onMove={(dir) => move(f.key, dir)}
              />
            ))}
          </ul>
          <div className="mt-4">
            {!addingField ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAddingField(true)}
              >
                <Plus data-icon="inline-start" /> Add field
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {PALETTE.map((p) => (
                  <Button
                    key={p.type}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      addField(p.type);
                      setAddingField(false);
                    }}
                  >
                    <p.Icon data-icon="inline-start" /> {p.label}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setAddingField(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </DashboardPanel>

        <CollapsiblePanel
          title="Category routing"
          icon={Split}
          tone="amber"
          hint={
            routing.rules.length > 0
              ? `${routing.rules.length} rule${routing.rules.length === 1 ? "" : "s"}`
              : "Optional"
          }
          defaultOpen={routing.rules.length > 0}
        >
          <RoutingEditor fields={fields} routing={routing} onChange={setRouting} />
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Confirmation message"
          icon={MessageSquare}
          tone="emerald"
          hint={confirmation.trim() ? "Custom" : "Default thank-you"}
          defaultOpen={Boolean(confirmation.trim())}
        >
          <Textarea
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            rows={2}
            placeholder="Shown after a speaker submits; a default thank-you is used if empty…"
            className="resize-none"
            aria-label="Confirmation message"
          />
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Agenda handoff mappings"
          icon={ArrowRightLeft}
          tone="pink"
          hint="Explicit format and track mapping"
          defaultOpen={Boolean(form.handoffMappingsJson)}
        >
          <HandoffMappingEditor
            fields={fields}
            tracks={tracks}
            submissions={submissions}
            value={handoff}
            onChange={setHandoff}
          />
        </CollapsiblePanel>
      </div>

      {/* ---------------- Right: live preview (browser frame) ---------------- */}
      <div className="xl:sticky xl:top-6 xl:self-start">
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
          <div className="flex items-center gap-3 border-b border-zinc-100 bg-zinc-50 px-4 py-2.5">
            <span className="flex gap-1.5" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-zinc-300" />
              <span className="size-2.5 rounded-full bg-zinc-300" />
              <span className="size-2.5 rounded-full bg-zinc-300" />
            </span>
            <span className="min-w-0 flex-1 truncate rounded-md bg-white px-3 py-1 text-[11px] tabular-nums text-zinc-500 ring-1 ring-zinc-200">
              smolboard.app/{orgSlug ?? "…"}/{event.slug}/cfp/{slugify(name) || form.slug}
            </span>
            <button
              type="button"
              onClick={() => setPreviewAnswers({})}
              className="shrink-0 text-[11px] font-medium text-zinc-400 transition-colors hover:text-zinc-700"
            >
              Reset
            </button>
          </div>
          <div className="p-5">
            {fields.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400">
                Add fields on the left — the preview responds like the real form,
                including conditions.
              </p>
            ) : (
              <FormRenderer
                fields={fields}
                answers={previewAnswers}
                onChange={setPreviewAnswers}
              />
            )}
          </div>
        </div>
      </div>
    </DashboardWidePage>
  );
}

/* ------------------------- Collapsed side sections ------------------------- */

function HandoffMappingEditor({
  fields,
  tracks,
  submissions,
  value,
  onChange,
}: {
  fields: FormField[];
  tracks: TrackRow[];
  submissions: SubmissionRow[];
  value: SubmissionHandoffConfig;
  onChange: (value: SubmissionHandoffConfig) => void;
}) {
  const sourceFields = fields.filter((field) => field.type !== "section");
  const valuesFor = (fieldKey: string | null) => {
    const field = fields.find((candidate) => candidate.key === fieldKey);
    return [...new Set([...(field?.options ?? []), ...mappingSourceValues(submissions, fieldKey)])].sort();
  };
  const formatValues = valuesFor(value.formatFieldKey);
  const trackValues = valuesFor(value.trackFieldKey);
  return (
    <div className="space-y-5">
      <p className="text-xs text-zinc-500">Choose the exact source field and map every observed value. “No source field” is an explicit choice; legacy values are never inferred.</p>
      <div>
        <label className="text-xs font-medium">Format source field</label>
        <Select className="mt-1" value={value.formatFieldKey ?? ""} onChange={(event) => onChange({ ...value, formatFieldKey: event.target.value || null })}>
          <option value="">No source field — default to talk</option>
          {sourceFields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
        </Select>
        {formatValues.map((source) => (
          <label key={source} className="mt-2 grid grid-cols-[1fr_12rem] items-center gap-3 text-xs">
            <span className={!value.formatValues[source] ? "font-medium text-amber-700" : ""}>{source}{!value.formatValues[source] ? " · unresolved" : ""}</span>
            <Select value={value.formatValues[source] ?? ""} onChange={(event) => onChange({ ...value, formatValues: { ...value.formatValues, [source]: event.target.value } })}>
              <option value="">Unresolved</option>
              {['talk', 'workshop', 'panel', 'keynote'].map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </Select>
          </label>
        ))}
      </div>
      <div>
        <label className="text-xs font-medium">Track source field</label>
        <Select className="mt-1" value={value.trackFieldKey ?? ""} onChange={(event) => onChange({ ...value, trackFieldKey: event.target.value || null })}>
          <option value="">No source field — no track</option>
          {sourceFields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
        </Select>
        {trackValues.map((source) => (
          <label key={source} className="mt-2 grid grid-cols-[1fr_12rem] items-center gap-3 text-xs">
            <span className={!value.trackValues[source] ? "font-medium text-amber-700" : ""}>{source}{!value.trackValues[source] ? " · unresolved" : ""}</span>
            <Select value={value.trackValues[source] ?? ""} onChange={(event) => onChange({ ...value, trackValues: { ...value.trackValues, [source]: event.target.value } })}>
              <option value="">Unresolved</option>
              {tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
            </Select>
          </label>
        ))}
      </div>
    </div>
  );
}

// Routing and the confirmation message are set-once options; keeping them
// folded keeps the builder to two working surfaces (fields + preview).
function CollapsiblePanel({
  title,
  hint,
  icon,
  tone,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: DashboardChipTone;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-2.5 rounded-xl px-4 py-2 text-left"
      >
        {icon ? <DashboardIconChip icon={icon} tone={tone} size="sm" /> : null}
        <span className="text-sm font-semibold text-zinc-900">{title}</span>
        {hint && !open && <span className="text-xs text-zinc-400">{hint}</span>}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "ml-auto size-4 shrink-0 text-zinc-400 transition-transform duration-150",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open && <div className="border-t border-zinc-100 px-4 py-4">{children}</div>}
    </section>
  );
}

/* ------------------------- Field editor row ------------------------- */

function FieldEditor({
  field,
  allFields,
  index,
  count,
  open,
  onToggle,
  onPatch,
  onRemove,
  onMove,
}: {
  field: FormField;
  allFields: FormField[];
  index: number;
  count: number;
  open: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<FormField>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const meta = PALETTE.find((p) => p.type === field.type);
  // Fields a showIf rule may reference: anything defined ABOVE this one that
  // can hold an answer.
  const upstream = allFields.slice(0, index).filter((f) => f.type !== "section");

  return (
    <li className="group/field rounded-lg border border-zinc-200">
      <div className="flex items-center gap-2 px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onToggle}
          className="min-w-0 flex-1 justify-start"
        >
          {open ? (
            <ChevronDown className="size-3.5 shrink-0 text-zinc-400" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-zinc-400" />
          )}
          <span className="truncate text-[13.5px] font-medium text-zinc-800">{field.label}</span>
          <span className="shrink-0 text-[11px] text-zinc-400">
            {meta?.label ?? field.type}
            {field.required ? " · required" : ""}
            {field.showIf && field.showIf.length > 0 ? " · conditional" : ""}
          </span>
        </Button>
        {/* Row controls stay hidden until the row is hovered, focused, or
            expanded — seven fields × three icons is the main source of noise. */}
        <div
          className={cn(
            "flex items-center transition-opacity duration-150",
            !open &&
              "opacity-0 group-hover/field:opacity-100 focus-within:opacity-100",
          )}
        >
          <Button type="button" size="icon" variant="ghost" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp />
          </Button>
          <Button type="button" size="icon" variant="ghost" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown />
          </Button>
          <Button type="button" size="icon" variant="ghost" aria-label="Delete field" onClick={onRemove}>
            <Trash2 />
          </Button>
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-t border-zinc-100 px-3 py-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Label</span>
            <Input
              value={field.label}
              onChange={(e) => onPatch({ label: e.target.value })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">Help text</span>
              <Input
                value={field.helpText ?? ""}
                onChange={(e) => onPatch({ helpText: e.target.value || undefined })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">Placeholder</span>
              <Input
                value={field.placeholder ?? ""}
                onChange={(e) => onPatch({ placeholder: e.target.value || undefined })}
              />
            </label>
          </div>
          {field.type !== "section" && (
            <label className="flex min-h-9 items-center gap-2 text-[13px] text-zinc-700">
              <Checkbox
                checked={field.required ?? false}
                onCheckedChange={(checked) =>
                  onPatch({ required: checked === true || undefined })
                }
              />
              Required
            </label>
          )}
          {(field.type === "select" || field.type === "multiselect") && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">
                Options (one per line)
              </span>
              <Textarea
                value={(field.options ?? []).join("\n")}
                onChange={(e) =>
                  onPatch({ options: e.target.value.split("\n").filter((o) => o.trim() !== "") })
                }
                rows={3}
                className="resize-y"
              />
            </label>
          )}

          <ShowIfEditor
            rules={field.showIf ?? []}
            upstream={upstream}
            onChange={(rules) => onPatch({ showIf: rules.length ? rules : undefined })}
          />
        </div>
      )}
    </li>
  );
}

/* ------------------------- showIf rules ------------------------- */

function ShowIfEditor({
  rules,
  upstream,
  onChange,
}: {
  rules: ShowIfRule[];
  upstream: FormField[];
  onChange: (rules: ShowIfRule[]) => void;
}) {
  if (upstream.length === 0) return null;
  function patch(i: number, p: Partial<ShowIfRule>) {
    onChange(rules.map((r, j) => (j === i ? { ...r, ...p } : r)));
  }
  return (
    <div className="rounded-lg bg-zinc-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500">
          Show this field only when…
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onChange([...rules, { field: upstream[0].key, op: "equals", value: "" }])}
        >
          <Plus data-icon="inline-start" /> Add condition
        </Button>
      </div>
      {rules.length > 0 && (
        <ul className="mt-2 space-y-2">
          {rules.map((r, i) => {
            const target = upstream.find((f) => f.key === r.field);
            return (
              <li key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)_auto] sm:items-center">
                <Select
                  value={r.field}
                  onChange={(e) => patch(i, { field: e.target.value })}
                  className="w-full"
                  aria-label="Condition field"
                >
                  {upstream.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </Select>
                <Select
                  value={r.op}
                  onChange={(e) => patch(i, { op: e.target.value as ShowIfOp })}
                  className="w-full"
                  aria-label="Condition operator"
                >
                  {OPS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                {r.op !== "is_answered" &&
                  (target?.options && target.options.length > 0 ? (
                    <Select
                      value={r.value ?? ""}
                      onChange={(e) => patch(i, { value: e.target.value })}
                      className="w-full"
                      aria-label="Condition value"
                    >
                      <option value="">Select…</option>
                      {target.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      value={r.value ?? ""}
                      onChange={(e) => patch(i, { value: e.target.value })}
                      className="w-full"
                      aria-label="Condition value"
                    />
                  ))}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remove condition"
                  onClick={() => onChange(rules.filter((_, j) => j !== i))}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------- routing rules ------------------------- */

function RoutingEditor({
  fields,
  routing,
  onChange,
}: {
  fields: FormField[];
  routing: RoutingConfig;
  onChange: (r: RoutingConfig) => void;
}) {
  const answerable = fields.filter((f) => f.type !== "section");
  function patch(i: number, p: Partial<RoutingRule>) {
    onChange({ ...routing, rules: routing.rules.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-pretty text-sm text-zinc-500">
          The first matching rule tags the submission for review filtering.
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={answerable.length === 0}
          onClick={() =>
            onChange({
              ...routing,
              rules: [
                ...routing.rules,
                { field: answerable[0]?.key ?? "", op: "equals", value: "", category: "" },
              ],
            })
          }
        >
          <Plus data-icon="inline-start" /> Add rule
        </Button>
      </div>

      {routing.rules.length > 0 && (
        <ul className="mt-3 space-y-2">
          {routing.rules.map((r, i) => {
            const target = answerable.find((f) => f.key === r.field);
            return (
              <li key={i} className="grid gap-2 sm:grid-cols-[auto_minmax(7rem,1fr)_6rem_minmax(7rem,1fr)_auto_minmax(6rem,8rem)_auto] sm:items-center">
                <span className="hidden text-xs text-zinc-400 sm:inline">if</span>
                <Select
                  value={r.field}
                  onChange={(e) => patch(i, { field: e.target.value })}
                  className="w-full"
                  aria-label="Routing field"
                >
                  {answerable.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </Select>
                <Select
                  value={r.op}
                  onChange={(e) => patch(i, { op: e.target.value as ShowIfOp })}
                  className="w-full"
                  aria-label="Routing operator"
                >
                  {OPS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                {r.op !== "is_answered" &&
                  (target?.options && target.options.length > 0 ? (
                    <Select
                      value={r.value ?? ""}
                      onChange={(e) => patch(i, { value: e.target.value })}
                      className="w-full"
                      aria-label="Routing value"
                    >
                      <option value="">Select…</option>
                      {target.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      value={r.value ?? ""}
                      onChange={(e) => patch(i, { value: e.target.value })}
                      className="w-full"
                      aria-label="Routing value"
                    />
                  ))}
                <span className="hidden text-xs text-zinc-400 sm:inline">→</span>
                <Input
                  value={r.category}
                  onChange={(e) => patch(i, { category: e.target.value })}
                  placeholder="Category…"
                  className="w-full"
                  aria-label="Routing category"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remove rule"
                  onClick={() =>
                    onChange({ ...routing, rules: routing.rules.filter((_, j) => j !== i) })
                  }
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <label className="mt-3 flex items-center gap-2">
        <span className="text-xs text-zinc-500">Default category</span>
        <Input
          value={routing.defaultCategory ?? ""}
          onChange={(e) => onChange({ ...routing, defaultCategory: e.target.value || undefined })}
          placeholder="General…"
          className="w-40"
          aria-label="Default category"
        />
      </label>
    </div>
  );
}
