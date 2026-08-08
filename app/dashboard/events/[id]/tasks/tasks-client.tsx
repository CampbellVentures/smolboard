"use client";

import React, { useEffect, useMemo, useState } from "react";
import { callFn, db } from "@pylonsync/react";
import { AlertTriangle, CheckCircle2, ClipboardList, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  DashboardEmptyState,
  DashboardPage,
  DashboardStatStrip,
  DashboardStatusBadge,
  DashboardToolbar,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { fieldsOf } from "@/lib/types";
import { taskDueState } from "@/lib/tasks";
import type {
  EventRow,
  SpeakerProfileRow,
  SpeakerTaskRow,
  SubmissionRow,
  TaskTemplateRow,
} from "@/lib/types";

interface EditorState {
  id?: string;
  title: string;
  description: string;
  kind: string;
  target: string;
  responsePrompt: string;
  dueAt: string;
  appliesTo: string;
}

const blankEditor: EditorState = {
  title: "",
  description: "",
  kind: "confirm",
  target: "",
  responsePrompt: "",
  dueAt: "",
  appliesTo: "accepted",
};

export function TasksClient({
  event,
  initialTemplates,
  initialTasks,
  profiles,
  submissions,
}: {
  event: EventRow;
  initialTemplates: TaskTemplateRow[];
  initialTasks: SpeakerTaskRow[];
  profiles: SpeakerProfileRow[];
  submissions: SubmissionRow[];
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const templateQuery = db.useQuery<TaskTemplateRow>("TaskTemplate");
  const taskQuery = db.useQuery<SpeakerTaskRow>("SpeakerTask");
  const templates = (!hydrated || templateQuery.loading ? initialTemplates : templateQuery.data).filter(
    (row) => row.eventId === event.id,
  );
  const tasks = (!hydrated || taskQuery.loading ? initialTasks : taskQuery.data).filter(
    (row) => row.eventId === event.id,
  );
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const acceptedSpeakers = new Set(
    submissions.filter((row) => row.status === "accepted").map((row) => row.speakerUserId),
  );
  const completed = tasks.filter((task) => task.status === "done").length;
  const now = new Date();
  const templateById = new Map(templates.map((template) => [template.id, template]));
  const overdue = tasks.filter(
    (task) => taskDueState(task, templateById.get(task.taskTemplateId) ?? {}, now) === "overdue",
  );

  const rows = useMemo(
    () =>
      templates
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((template) => {
          const assigned = tasks.filter((task) => task.taskTemplateId === template.id);
          return {
            template,
            assigned: assigned.length,
            completed: assigned.filter((task) => task.status === "done").length,
            overdue: assigned.filter((task) => taskDueState(task, template, now) === "overdue").length,
          };
        }),
    [templates, tasks],
  );

  function editTemplate(template: TaskTemplateRow) {
    setEditor({
      id: template.id,
      title: template.title,
      description: template.description ?? "",
      kind: template.kind,
      target: template.target ?? "",
      responsePrompt: fieldsOf(template)[0]?.label ?? "",
      dueAt: toLocalDateTime(template.dueAt),
      appliesTo: template.appliesTo,
    });
  }

  async function save(event_: React.FormEvent) {
    event_.preventDefault();
    if (!editor) return;
    setSaving(true);
    try {
      const result = await callFn<{ id: string; tasksCreated: number }>("saveTaskTemplate", {
        eventId: event.id,
        templateId: editor.id,
        title: editor.title,
        description: editor.description || undefined,
        kind: editor.kind,
        target: editor.target || undefined,
        responsePrompt: editor.responsePrompt || undefined,
        dueAt: editor.dueAt ? new Date(editor.dueAt).toISOString() : undefined,
        appliesTo: editor.appliesTo,
      });
      setEditor(null);
      toast.success(editor.id ? "Task updated" : "Task created", {
        description: result.tasksCreated ? `Assigned to ${result.tasksCreated} speaker${result.tasksCreated === 1 ? "" : "s"}.` : undefined,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the task.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(templateId: string) {
    try {
      await callFn("deleteTaskTemplate", { templateId });
      toast.success("Task deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the task.");
    }
  }

  async function nudgeOverdue() {
    const speakerUserIds = [...new Set(overdue.map((task) => task.speakerUserId))];
    if (speakerUserIds.length === 0) return;
    try {
      const result = await callFn<{ queued: number }>("nudgeSpeakers", {
        eventId: event.id,
        speakerUserIds,
      });
      toast.success(`Queued ${result.queued} reminder${result.queued === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue reminders.");
    }
  }

  return (
    <DashboardPage>
      {rows.length === 0 ? (
        <DashboardEmptyState
          icon={ClipboardList}
          title="No onboarding tasks yet"
          description="Create the steps every accepted speaker needs to complete before the event."
        >
          <Button type="button" onClick={() => setEditor({ ...blankEditor })}>
            <Plus data-icon="inline-start" /> Create first task
          </Button>
        </DashboardEmptyState>
      ) : (
        <>
          <DashboardStatStrip
            items={[
              { icon: ClipboardList, label: "Templates", value: templates.length },
              { icon: Users, label: "Accepted speakers", value: acceptedSpeakers.size },
              {
                icon: CheckCircle2,
                label: "Completed",
                value: completed,
                hint: `${tasks.length} assigned`,
              },
              { icon: AlertTriangle, label: "Overdue", value: overdue.length },
            ]}
          />

          <DashboardToolbar className="justify-end">
            <div className="flex gap-2">
              {overdue.length > 0 ? (
                <Button type="button" variant="outline" onClick={nudgeOverdue}>
                  Nudge overdue
                </Button>
              ) : null}
              <Button type="button" onClick={() => setEditor({ ...blankEditor })}>
                <Plus data-icon="inline-start" /> New task
              </Button>
            </div>
          </DashboardToolbar>

          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead className="w-16"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ template, assigned, completed: rowCompleted, overdue: rowOverdue }) => (
                <TableRow
                  key={template.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  onClick={() => editTemplate(template)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      editTemplate(template);
                    }
                  }}
                >
                  <TableCell>
                    <div className="font-medium">{template.title}</div>
                    {template.description ? <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{template.description}</div> : null}
                  </TableCell>
                  <TableCell><DashboardStatusBadge status={template.kind}>{template.kind}</DashboardStatusBadge></TableCell>
                  <TableCell className="text-muted-foreground">{formatDue(template.dueAt)}</TableCell>
                  <TableCell>
                    <span className="tabular-nums">{rowCompleted}/{assigned}</span>
                    {rowOverdue > 0 ? <span className="ml-2 text-xs text-destructive">{rowOverdue} overdue</span> : null}
                  </TableCell>
                  <TableCell
                    onClick={(click) => click.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" size="icon" variant="ghost" aria-label={`Delete ${template.title}`}>
                          <Trash2 data-icon="inline-start" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete “{template.title}”?</AlertDialogTitle>
                          <AlertDialogDescription>This also removes the task from every speaker’s checklist.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => remove(template.id)}>Delete task</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
          </div>
        </>
      )}

      <TaskEditor editor={editor} onChange={setEditor} saving={saving} onSubmit={save} />
    </DashboardPage>
  );
}

function TaskEditor({
  editor,
  onChange,
  saving,
  onSubmit,
}: {
  editor: EditorState | null;
  onChange: (value: EditorState | null) => void;
  saving: boolean;
  onSubmit: (event: React.FormEvent) => void;
}) {
  if (!editor) return null;
  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) => onChange({ ...editor, [key]: value });
  return (
    <Dialog open onOpenChange={(open) => !open && onChange(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editor.id ? "Edit speaker task" : "New speaker task"}</DialogTitle>
          <DialogDescription>Assigned tasks appear live in each speaker’s portal.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="task-title">Title</FieldLabel>
              <Input id="task-title" value={editor.title} onChange={(event) => set("title", event.target.value)} autoFocus required />
            </Field>
            <Field>
              <FieldLabel htmlFor="task-description">Instructions</FieldLabel>
              <Textarea id="task-description" rows={3} value={editor.description} onChange={(event) => set("description", event.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="task-kind">Task type</FieldLabel>
                <Select id="task-kind" value={editor.kind} onChange={(event) => set("kind", event.target.value)}>
                  <option value="confirm">Confirmation</option>
                  <option value="upload">File upload</option>
                  <option value="form">Written response</option>
                  <option value="link">External link</option>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="task-audience">Assign to</FieldLabel>
                <Select id="task-audience" value={editor.appliesTo} onChange={(event) => set("appliesTo", event.target.value)}>
                  <option value="accepted">Accepted speakers</option>
                  <option value="all">All submitters</option>
                </Select>
              </Field>
            </div>
            {editor.kind === "link" ? (
              <Field>
                <FieldLabel htmlFor="task-target">Destination URL</FieldLabel>
                <Input id="task-target" type="url" value={editor.target} onChange={(event) => set("target", event.target.value)} placeholder="https://…" required />
              </Field>
            ) : null}
            {editor.kind === "upload" ? (
              <Field>
                <FieldLabel htmlFor="task-file-kind">Required file</FieldLabel>
                <Select id="task-file-kind" value={editor.target || "document"} onChange={(event) => set("target", event.target.value)}>
                  <option value="headshot">Headshot</option>
                  <option value="slides">Slides</option>
                  <option value="document">Document</option>
                </Select>
              </Field>
            ) : null}
            {editor.kind === "form" ? (
              <Field>
                <FieldLabel htmlFor="task-prompt">Response prompt</FieldLabel>
                <Input id="task-prompt" value={editor.responsePrompt} onChange={(event) => set("responsePrompt", event.target.value)} placeholder="Anything we should know about your setup?" />
                <FieldDescription>Speakers answer this in a long-text field.</FieldDescription>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="task-due">Due date</FieldLabel>
              <Input id="task-due" type="datetime-local" value={editor.dueAt} onChange={(event) => set("dueAt", event.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onChange(null)}>Cancel</Button>
            <Button type="submit" disabled={saving || !editor.title.trim()}>{saving ? "Saving…" : "Save task"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function toLocalDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDue(value?: string) {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
