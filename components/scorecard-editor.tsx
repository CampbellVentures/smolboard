"use client";

import React from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { NormalizedReviewCriterion } from "@/lib/reviews";

// The scorecard a round's reviewers fill in. All three field types the review
// engine understands are configurable here, so a round can mix a weighted
// 1–5 rating, a dropdown, and a free-text prompt.
export type DraftCriterion = NormalizedReviewCriterion;

export const NEW_CRITERION: DraftCriterion = {
  key: "",
  label: "",
  type: "numeric",
  min: 1,
  max: 5,
  weight: 1,
  required: false,
};

export function keyFor(label: string, taken: Set<string>): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "criterion";
  let key = base;
  let n = 2;
  while (taken.has(key)) key = `${base}_${n++}`;
  return key;
}

export function ScorecardEditor({
  criteria,
  onChange,
}: {
  criteria: DraftCriterion[];
  onChange: (next: DraftCriterion[]) => void;
}) {
  function patch(index: number, updates: Partial<DraftCriterion>) {
    onChange(criteria.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  }
  function remove(index: number) {
    onChange(criteria.filter((_, i) => i !== index));
  }
  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= criteria.length) return;
    const next = criteria.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  function add() {
    onChange([...criteria, { ...NEW_CRITERION }]);
  }

  return (
    <div className="flex flex-col gap-3">
      {criteria.map((criterion, index) => (
        <div key={index} className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-start gap-2">
            <button
              type="button"
              aria-label={`Move ${criterion.label || "criterion"} up`}
              onClick={() => move(index, -1)}
              className="mt-2 text-muted-foreground hover:text-foreground"
            >
              <GripVertical className="size-4" aria-hidden="true" />
            </button>
            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`crit-label-${index}`}>Question</Label>
                <Input
                  id={`crit-label-${index}`}
                  value={criterion.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    const taken = new Set(criteria.filter((_, i) => i !== index).map((c) => c.key));
                    patch(index, { label, key: criterion.key || keyFor(label, taken) });
                  }}
                  placeholder="Relevance to the audience"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`crit-type-${index}`}>Type</Label>
                <Select
                  id={`crit-type-${index}`}
                  value={criterion.type}
                  onChange={(e) =>
                    patch(index, { type: e.target.value as DraftCriterion["type"] })
                  }
                >
                  <option value="numeric">Rating</option>
                  <option value="select">Dropdown</option>
                  <option value="text">Free text</option>
                </Select>
              </div>
            </div>
            <button
              type="button"
              aria-label={`Remove ${criterion.label || "criterion"}`}
              onClick={() => remove(index)}
              className="mt-2 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 grid gap-3 pl-6 sm:grid-cols-3">
            {criterion.type === "numeric" ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`crit-max-${index}`}>Highest score</Label>
                  <Select
                    id={`crit-max-${index}`}
                    value={String(criterion.max ?? 5)}
                    onChange={(e) => patch(index, { max: Number(e.target.value) })}
                  >
                    {[3, 5, 10].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`crit-weight-${index}`}>Weight</Label>
                  <Select
                    id={`crit-weight-${index}`}
                    value={String(criterion.weight)}
                    onChange={(e) => patch(index, { weight: Number(e.target.value) })}
                  >
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>×{n}</option>
                    ))}
                  </Select>
                </div>
              </>
            ) : null}
            {criterion.type === "select" ? (
              <div className="flex flex-col gap-1.5 sm:col-span-3">
                <Label htmlFor={`crit-options-${index}`}>Choices</Label>
                <Input
                  id={`crit-options-${index}`}
                  value={(criterion.options ?? []).join(", ")}
                  onChange={(e) =>
                    patch(index, {
                      options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean),
                    })
                  }
                  placeholder="Strong yes, Yes, Maybe, No"
                  autoComplete="off"
                />
              </div>
            ) : null}
            <label className="flex items-center gap-2 self-end text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={criterion.required}
                onChange={(e) => patch(index, { required: e.target.checked })}
                className="size-3.5"
              />
              Required
            </label>
          </div>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={add} className="self-start">
        <Plus data-icon="inline-start" /> Add criterion
      </Button>
    </div>
  );
}
