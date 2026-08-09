import type {
  DeliverableSlotRow,
  DeliverableVersionRow,
  SpeakerTaskRow,
  TaskTemplateRow,
} from "./types";

export const MAX_DELIVERABLE_BYTES = 25 * 1024 * 1024;

export function versionsForSlot(
  versions: DeliverableVersionRow[],
  slotId: string,
): DeliverableVersionRow[] {
  return versions
    .filter((version) => version.slotId === slotId)
    .slice()
    .sort((a, b) => b.versionNumber - a.versionNumber || b.createdAt.localeCompare(a.createdAt));
}
export function latestVersion(
  versions: DeliverableVersionRow[],
  slotId: string,
): DeliverableVersionRow | undefined {
  return versionsForSlot(versions, slotId)[0];
}

export function taskSlot(slots: DeliverableSlotRow[], taskId: string) {
  return slots.find((slot) => slot.taskId === taskId);
}

export type DeliverableProgressFilter = "all" | "pending" | "uploaded" | "overdue";

export function filterDeliverableTasks(
  tasks: SpeakerTaskRow[],
  templates: TaskTemplateRow[],
  slots: DeliverableSlotRow[],
  versions: DeliverableVersionRow[],
  filter: DeliverableProgressFilter,
  now = new Date(),
) {
  if (filter === "all") return tasks;
  const templateById = new Map(templates.map((template) => [template.id, template]));
  return tasks.filter((task) => {
    const slot = taskSlot(slots, task.id);
    const uploaded = Boolean(slot && latestVersion(versions, slot.id));
    if (filter === "uploaded") return uploaded;
    if (filter === "pending") return !uploaded;
    const dueAt = templateById.get(task.taskTemplateId)?.dueAt;
    return !uploaded && Boolean(dueAt && Date.parse(dueAt) < now.getTime());
  });
}
