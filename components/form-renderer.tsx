"use client";

import React from "react";
import {
  type Answers,
  type FormField,
  type ValidationError,
  visibleFields,
} from "@/lib/forms";

// Shared controlled renderer for FormField[] — the SAME component draws the
// builder's live preview, the public CFP form, and speaker "form" tasks, so
// what the organizer designs is exactly what the speaker sees.
//
// Conditional chains: when an answer changes, the parent should pass the new
// answers straight back in; fields whose showIf no longer matches disappear,
// and pruneAnswers() at submit time drops their stale values.

const fieldCls =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-[border-color,box-shadow] placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10";

export function FormRenderer({
  fields,
  answers,
  onChange,
  errors = [],
  disabled = false,
}: {
  fields: FormField[];
  answers: Answers;
  onChange: (next: Answers) => void;
  errors?: ValidationError[];
  disabled?: boolean;
}) {
  const errFor = (key: string) => errors.find((e) => e.field === key)?.message;

  function set(key: string, value: Answers[string]) {
    onChange({ ...answers, [key]: value });
  }

  return (
    <div className="space-y-5">
      {visibleFields(fields, answers).map((f) => {
        if (f.type === "section") {
          return (
            <div key={f.key} className="border-b border-zinc-200 pb-1.5 pt-3">
              <h3 className="text-sm font-semibold text-zinc-900">{f.label}</h3>
              {f.helpText && <p className="mt-0.5 text-xs text-zinc-500">{f.helpText}</p>}
            </div>
          );
        }
        const err = errFor(f.key);
        return (
          <div key={f.key}>
            <label className="block">
              <span className="mb-1.5 flex items-baseline gap-1 text-[13px] font-medium text-zinc-700">
                {f.label}
                {f.required && <span className="text-red-500">*</span>}
              </span>
              <FieldInput field={f} value={answers[f.key]} onChange={(v) => set(f.key, v)} disabled={disabled} />
            </label>
            {f.helpText && !err && <p className="mt-1 text-xs text-zinc-400">{f.helpText}</p>}
            {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
          </div>
        );
      })}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: Answers[string];
  onChange: (v: Answers[string]) => void;
  disabled: boolean;
}) {
  switch (field.type) {
    case "long_text":
      return (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          placeholder={field.placeholder}
          disabled={disabled}
          className={fieldCls + " resize-y"}
        />
      );
    case "select":
      return (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          disabled={disabled}
          className={fieldCls}
        >
          <option value="">Select…</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "multiselect": {
      const chosen = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-1.5 rounded-md border border-zinc-200 p-3">
          {(field.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={chosen.includes(o)}
                disabled={disabled}
                onChange={(e) =>
                  onChange(
                    e.target.checked ? [...chosen, o] : chosen.filter((c) => c !== o),
                  )
                }
                className="size-4 rounded border-zinc-300 accent-zinc-900"
              />
              {o}
            </label>
          ))}
          {(field.options ?? []).length === 0 && (
            <p className="text-xs text-zinc-400">No options configured.</p>
          )}
        </div>
      );
    }
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="size-4 rounded border-zinc-300 accent-zinc-900"
          />
          <span className="text-zinc-500">{field.placeholder || "Yes"}</span>
        </label>
      );
    default:
      // short_text, email, url share a text input with the right inputmode.
      return (
        <input
          type={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          className={fieldCls}
        />
      );
  }
}
