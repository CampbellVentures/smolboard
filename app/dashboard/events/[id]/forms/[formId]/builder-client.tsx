"use client";

import React, { useMemo, useState } from "react";
import { db } from "@pylonsync/react";
import { DashboardPanel, DashboardWidePage } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
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
import {
  ArrowDown,
  ArrowUp,
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
}: {
  event: { id: string; slug: string };
  form: {
    id: string;
    name: string;
    slug: string;
    description?: string;
    status: string;
    fieldsJson?: unknown;
    routingJson?: unknown;
    confirmationMessage?: string;
  };
}) {
  const [name, setName] = useState(form.name);
  const [description, setDescription] = useState(form.description ?? "");
  const [confirmation, setConfirmation] = useState(form.confirmationMessage ?? "");
  const [status, setStatus] = useState(form.status);
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
      await db.update("SubmissionForm", form.id, {
        name: name.trim() || form.name,
        slug: slugify(name.trim() || form.name),
        description: description.trim() || undefined,
        confirmationMessage: confirmation.trim() || undefined,
        status,
        fieldsJson: fields,
        routingJson: routing,
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
        <DashboardPanel title="Form details" variant="subtle">
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
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-zinc-400">
              Public URL: /cfp/{event.slug}/{slugify(name) || form.slug}
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
          <div className="mt-4 flex flex-wrap gap-2">
            {PALETTE.map((p) => (
              <Button
                key={p.type}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => addField(p.type)}
              >
                <p.Icon data-icon="inline-start" /> {p.label}
              </Button>
            ))}
          </div>
        </DashboardPanel>

        <RoutingEditor fields={fields} routing={routing} onChange={setRouting} />

        <DashboardPanel title="Confirmation message" variant="subtle">
          <Textarea
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            rows={2}
            placeholder="Shown after a speaker submits; a default thank-you is used if empty…"
            className="resize-none"
            aria-label="Confirmation message"
          />
        </DashboardPanel>
      </div>

      {/* ---------------- Right: live preview ---------------- */}
      <div className="xl:sticky xl:top-6 xl:self-start">
        <DashboardPanel
          title="Live preview"
          variant="elevated"
          action={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setPreviewAnswers({})}
            >
              Reset answers
            </Button>
          }
        >
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
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
        </DashboardPanel>
      </div>
    </DashboardWidePage>
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
    <li className="rounded-lg border border-zinc-200">
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
          <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-500">
            {meta?.label ?? field.type}
          </span>
          {field.required && <span className="text-[11px] text-red-400">required</span>}
          {field.showIf && field.showIf.length > 0 && (
            <span className="text-[11px] text-blue-500">conditional</span>
          )}
        </Button>
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

      {open && (
        <div className="flex flex-col gap-3 border-t border-zinc-100 px-3 py-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Label</span>
            <Input
              value={field.label}
              onChange={(e) => onPatch({ label: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
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
            <label className="flex items-center gap-2 text-[13px] text-zinc-700">
              <input
                type="checkbox"
                checked={field.required ?? false}
                onChange={(e) => onPatch({ required: e.target.checked || undefined })}
                className="size-4 rounded border-zinc-300 accent-zinc-900"
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
              <li key={i} className="flex items-center gap-2">
                <Select
                  value={r.field}
                  onChange={(e) => patch(i, { field: e.target.value })}
                  className="flex-1"
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
                  className="w-28"
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
                      className="flex-1"
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
                      className="flex-1"
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
    <DashboardPanel
      title="Category routing"
      description="The first matching rule tags the submission for review filtering."
      variant="subtle"
      action={
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
      }
    >

      {routing.rules.length > 0 && (
        <ul className="mt-3 space-y-2">
          {routing.rules.map((r, i) => {
            const target = answerable.find((f) => f.key === r.field);
            return (
              <li key={i} className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">if</span>
                <Select
                  value={r.field}
                  onChange={(e) => patch(i, { field: e.target.value })}
                  className="flex-1"
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
                  className="w-24"
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
                      className="flex-1"
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
                      className="flex-1"
                      aria-label="Routing value"
                    />
                  ))}
                <span className="text-xs text-zinc-400">→</span>
                <Input
                  value={r.category}
                  onChange={(e) => patch(i, { category: e.target.value })}
                  placeholder="Category…"
                  className="w-32"
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
    </DashboardPanel>
  );
}
