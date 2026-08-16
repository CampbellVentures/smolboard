"use client";

import React, { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

export function FormRenderer({
  fields,
  answers,
  onChange,
  errors = [],
  disabled = false,
  idPrefix: stablePrefix,
}: {
  fields: FormField[];
  answers: Answers;
  onChange: (next: Answers) => void;
  errors?: ValidationError[];
  disabled?: boolean;
  // Pass a stable prefix when the form is server-rendered: useId is
  // position-based, and the SSR tree includes a framework Suspense wrapper
  // the client render lacks, so the generated ids differ and every field
  // logs a hydration attribute mismatch.
  idPrefix?: string;
}) {
  const generatedPrefix = useId();
  const idPrefix = stablePrefix ?? generatedPrefix;
  const errFor = (key: string) => errors.find((e) => e.field === key)?.message;

  function set(key: string, value: Answers[string]) {
    onChange({ ...answers, [key]: value });
  }

  return (
    <FieldGroup className="gap-5">
      {visibleFields(fields, answers).map((f) => {
        if (f.type === "section") {
          return (
            <FieldSet key={f.key} className="gap-1 border-b pb-3 pt-2">
              <FieldLegend>{f.label}</FieldLegend>
              {f.helpText ? <FieldDescription>{f.helpText}</FieldDescription> : null}
            </FieldSet>
          );
        }
        const err = errFor(f.key);
        const id = `${idPrefix}-${f.key}`;
        if (f.type === "multiselect") {
          const chosen = Array.isArray(answers[f.key]) ? answers[f.key] as string[] : [];
          return (
            <FieldSet key={f.key} data-invalid={!!err} className="gap-3">
              <FieldLegend variant="label">
                {f.label}{f.required ? <span className="text-destructive"> *</span> : null}
              </FieldLegend>
              <FieldGroup className="gap-2">
                {(f.options ?? []).map((option, index) => {
                  const optionId = `${id}-${index}`;
                  return (
                    <Field key={option} orientation="horizontal">
                      <Checkbox
                        id={optionId}
                        checked={chosen.includes(option)}
                        disabled={disabled}
                        aria-invalid={!!err}
                        onCheckedChange={(checked) =>
                          set(
                            f.key,
                            checked === true
                              ? [...chosen, option]
                              : chosen.filter((value) => value !== option),
                          )
                        }
                      />
                      <FieldLabel htmlFor={optionId} className="font-normal">
                        {option}
                      </FieldLabel>
                    </Field>
                  );
                })}
              </FieldGroup>
              {(f.options ?? []).length === 0 ? (
                <FieldDescription>No options configured.</FieldDescription>
              ) : null}
              {f.helpText && !err ? <FieldDescription>{f.helpText}</FieldDescription> : null}
              {err ? <FieldError>{err}</FieldError> : null}
            </FieldSet>
          );
        }
        if (f.type === "checkbox") {
          return (
            <Field key={f.key} orientation="horizontal" data-invalid={!!err}>
              <Checkbox
                id={id}
                name={f.key}
                checked={answers[f.key] === true}
                disabled={disabled}
                aria-invalid={!!err}
                onCheckedChange={(checked) => set(f.key, checked === true)}
              />
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor={id}>
                  {f.label}{f.required ? <span className="text-destructive"> *</span> : null}
                </FieldLabel>
                {f.helpText && !err ? <FieldDescription>{f.helpText}</FieldDescription> : null}
                {err ? <FieldError>{err}</FieldError> : null}
              </div>
            </Field>
          );
        }
        return (
          <Field key={f.key} data-invalid={!!err}>
            <FieldLabel htmlFor={id}>
              {f.label}{f.required ? <span className="text-destructive"> *</span> : null}
            </FieldLabel>
            <FieldInput
              id={id}
              field={f}
              value={answers[f.key]}
              onChange={(value) => set(f.key, value)}
              disabled={disabled}
              invalid={!!err}
            />
            {f.helpText && !err ? <FieldDescription>{f.helpText}</FieldDescription> : null}
            {err ? <FieldError>{err}</FieldError> : null}
          </Field>
        );
      })}
    </FieldGroup>
  );
}

function FieldInput({
  id,
  field,
  value,
  onChange,
  disabled,
  invalid,
}: {
  id: string;
  field: FormField;
  value: Answers[string];
  onChange: (v: Answers[string]) => void;
  disabled: boolean;
  invalid: boolean;
}) {
  switch (field.type) {
    case "long_text":
      return (
        <Textarea
          id={id}
          name={field.key}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          placeholder={field.placeholder}
          disabled={disabled}
          aria-invalid={invalid}
          className="resize-y"
        />
      );
    case "select":
      return (
        <Select
          id={id}
          name={field.key}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          disabled={disabled}
          aria-invalid={invalid}
        >
          <option value="">Select…</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
    default:
      // short_text, email, url share a text input with the right inputmode.
      return (
        <Input
          id={id}
          name={field.key}
          type={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          aria-invalid={invalid}
          autoComplete={field.type === "email" ? "email" : "off"}
          spellCheck={field.type === "email" ? false : undefined}
        />
      );
  }
}
