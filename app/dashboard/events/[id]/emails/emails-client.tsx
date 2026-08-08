"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { callFn, db } from "@pylonsync/react";
import { CheckCircle2, Mail, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  DashboardPage,
  DashboardPanel,
  DashboardStatStrip,
  DashboardStatusBadge,
} from "@/components/dashboard";
import {
  EmailComposer,
  type EmailComposerContent,
  type EmailComposerDocument,
  type EmailComposerHandle,
} from "@/components/email-composer";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DEFAULT_TEMPLATES,
  markdownToHtml,
  renderHtmlTemplate,
  renderTemplate,
} from "@/lib/email";
import { parseJson } from "@/lib/types";
import type { EmailLogRow, EmailTemplateRow, EventRow } from "@/lib/types";

const SAMPLE_VARS = {
  speaker_name: "Ada Speaker",
  event_name: "AI Engineer Summit",
  talk_title: "Building delightful realtime software",
  portal_link: "https://smolboard.dev/portal",
  task_list: "• Upload headshot\n• Confirm session details",
  session_time: "Tuesday, Aug 11 at 10:00 AM PDT",
  room: "Main stage",
  calendar_links: "Google Calendar · Outlook · Download .ics",
};

const MERGE_TAGS = [
  ["speaker_name", "Speaker"],
  ["event_name", "Event"],
  ["talk_title", "Talk"],
  ["portal_link", "Portal link"],
  ["task_list", "Task list"],
  ["session_time", "Session time"],
  ["room", "Room"],
  ["calendar_links", "Calendar links"],
] as const;

export function EmailsClient({
  event,
  initialTemplates,
  initialLogs,
}: {
  event: EventRow;
  initialTemplates: EmailTemplateRow[];
  initialLogs: EmailLogRow[];
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const templateQuery = db.useQuery<EmailTemplateRow>("EmailTemplate");
  const logQuery = db.useQuery<EmailLogRow>("EmailLog");
  const templates = (!hydrated || templateQuery.loading ? initialTemplates : templateQuery.data).filter(
    (row) => row.eventId === event.id,
  );
  const logs = (!hydrated || logQuery.loading ? initialLogs : logQuery.data).filter(
    (row) => row.eventId === event.id,
  );
  const [selectedKey, setSelectedKey] = useState(DEFAULT_TEMPLATES[0].key);
  const effective = templateValue(selectedKey, templates);
  const editorInstanceKey = `${selectedKey}:${effective.id ?? "default"}`;
  const composerRef = useRef<EmailComposerHandle>(null);
  const restoredInitialScroll = useRef(false);
  const [subject, setSubject] = useState(effective.subject);
  const [document, setDocument] = useState(() => templateDocument(effective));
  const [enabled, setEnabled] = useState(effective.enabled);
  const [editorReady, setEditorReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const editorContent = useMemo(() => templateEditorContent(effective), [editorInstanceKey]);

  useEffect(() => {
    const next = templateValue(selectedKey, templates);
    setSubject(next.subject);
    setDocument(templateDocument(next));
    setEnabled(next.enabled);
    setEditorReady(false);
  }, [editorInstanceKey]);

  useEffect(() => {
    if (!editorReady || restoredInitialScroll.current) return;
    restoredInitialScroll.current = true;
    requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }, [editorReady]);

  const preview = useMemo(
    () => ({
      subject: renderTemplate(subject, SAMPLE_VARS),
      html: renderHtmlTemplate(document.html, SAMPLE_VARS),
    }),
    [subject, document.html],
  );
  const sent = logs.filter((log) => log.status === "sent").length;
  const failed = logs.filter((log) => log.status === "failed").length;

  async function saveTemplate(notify = true) {
    setSaving(true);
    try {
      const nextDocument = await composerRef.current?.exportDocument();
      if (!nextDocument?.text.trim()) {
        toast.error("Add some email content before saving.");
        return false;
      }
      setDocument(nextDocument);
      const existing = templates.find((row) => row.key === selectedKey);
      if (existing) {
        await db.update("EmailTemplate", existing.id, {
          subject,
          body: nextDocument.text,
          bodyHtml: nextDocument.html,
          bodyJson: nextDocument.json,
          enabled,
        });
      } else {
        await db.insert("EmailTemplate", {
          orgId: event.orgId,
          eventId: event.id,
          key: selectedKey,
          subject,
          body: nextDocument.text,
          bodyHtml: nextDocument.html,
          bodyJson: nextDocument.json,
          enabled,
        });
      }
      if (notify) toast.success("Email template saved");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the template.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!(await saveTemplate(false))) return;
    try {
      const result = await callFn<{ queued: boolean; toEmail: string }>("sendTestEmail", {
        eventId: event.id,
        templateKey: selectedKey,
      });
      toast.success("Test email queued", { description: result.toEmail });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the test email.");
    }
  }

  return (
    <DashboardPage>
      <DashboardStatStrip
        items={[
          {
            icon: Mail,
            label: "Templates",
            value: DEFAULT_TEMPLATES.length,
            hint: `${templates.length} customized`,
          },
          { icon: CheckCircle2, label: "Delivered", value: sent },
          { icon: TriangleAlert, label: "Failed", value: failed },
        ]}
      />

      {hydrated ? (
        <Tabs defaultValue="templates">
          <TabsList>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="log">Delivery log</TabsTrigger>
          </TabsList>
          <TabsContent value="templates" className="pt-3">
          <div className="grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
            <DashboardPanel title="Messages" description="Automated speaker email" variant="subtle">
              <div className="flex flex-col gap-1">
                {DEFAULT_TEMPLATES.map((template) => (
                  <Button
                    key={template.key}
                    type="button"
                    variant={selectedKey === template.key ? "secondary" : "ghost"}
                    className="justify-start"
                    onClick={() => setSelectedKey(template.key)}
                  >
                    {labelForKey(template.key)}
                  </Button>
                ))}
              </div>
            </DashboardPanel>

            <div className="flex min-w-0 flex-col gap-5">
              <DashboardPanel
                title={labelForKey(selectedKey)}
                description="Merge tags are replaced when the message is sent."
                variant="elevated"
                action={
                  <Field orientation="horizontal" className="w-auto">
                    <FieldLabel htmlFor="email-enabled">Enabled</FieldLabel>
                    <Switch id="email-enabled" checked={enabled} onCheckedChange={setEnabled} />
                  </Field>
                }
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="email-subject">Subject</FieldLabel>
                    <Input id="email-subject" value={subject} onChange={(event_) => setSubject(event_.target.value)} />
                  </Field>
                  <Field>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <FieldLabel>Email body</FieldLabel>
                      <div className="flex flex-wrap justify-end gap-1.5" aria-label="Insert merge tag">
                        {MERGE_TAGS.map(([tag, label]) => (
                          <Button
                            key={tag}
                            type="button"
                            size="sm"
                            variant="outline"
                            className="px-2 text-xs"
                            disabled={!editorReady}
                            onClick={() => composerRef.current?.insertMergeTag(tag)}
                          >
                            + {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <EmailComposer
                      key={editorInstanceKey}
                      ref={composerRef}
                      content={editorContent}
                      initialDocument={templateDocument(effective)}
                      onDocumentChange={setDocument}
                      onReadyChange={setEditorReady}
                    />
                    <FieldDescription>
                      Select text to format it, or type <span className="font-mono">/</span> to add headings, lists, buttons, and dividers.
                    </FieldDescription>
                  </Field>
                </FieldGroup>
                <div className="mt-5 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={sendTest} disabled={saving || !editorReady}>
                    <Send data-icon="inline-start" /> Send test to me
                  </Button>
                  <Button type="button" onClick={() => saveTemplate()} disabled={saving || !editorReady || !subject.trim()}>
                    {saving ? "Saving…" : "Save template"}
                  </Button>
                </div>
              </DashboardPanel>

              <DashboardPanel title="Preview" description="Exported email with sample speaker data" variant="subtle">
                <div className="overflow-hidden rounded-lg border bg-muted/30">
                  <div className="border-b bg-background px-4 py-3 text-sm font-semibold">
                    {preview.subject || "No subject"}
                  </div>
                  <iframe
                    title="Email preview"
                    className="h-[460px] w-full bg-white"
                    sandbox=""
                    srcDoc={preview.html}
                  />
                </div>
              </DashboardPanel>
            </div>
          </div>
          </TabsContent>
          <TabsContent value="log" className="pt-3">
          <DashboardPanel title="Delivery log" description="Every automated and test send">
            {logs.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No emails have been sent for this event.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs
                    .slice()
                    .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1))
                    .map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{log.toEmail}</TableCell>
                        <TableCell>
                          <div className="font-medium">{log.subject}</div>
                          <div className="text-xs text-muted-foreground">{labelForKey(log.templateKey ?? "custom")}</div>
                        </TableCell>
                        <TableCell><DashboardStatusBadge status={log.status} /></TableCell>
                        <TableCell className="text-muted-foreground">{new Date(log.sentAt).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </DashboardPanel>
          </TabsContent>
        </Tabs>
      ) : null}
    </DashboardPage>
  );
}

function templateValue(key: string, custom: EmailTemplateRow[]) {
  const saved = custom.find((row) => row.key === key);
  const fallback = DEFAULT_TEMPLATES.find((row) => row.key === key)!;
  return {
    id: saved?.id,
    subject: saved?.subject ?? fallback.subject,
    body: saved?.body ?? fallback.body,
    bodyHtml: saved?.bodyHtml,
    bodyJson: saved?.bodyJson,
    enabled: saved?.enabled ?? true,
  };
}

function templateDocument(template: ReturnType<typeof templateValue>): EmailComposerDocument {
  return {
    text: template.body,
    html: template.bodyHtml ?? markdownToHtml(template.body),
    json: template.bodyJson ?? "",
  };
}

function templateEditorContent(template: ReturnType<typeof templateValue>): EmailComposerContent {
  if (template.bodyJson) {
    try {
      return parseJson<EmailComposerContent>(template.bodyJson) as EmailComposerContent;
    } catch {
      // A malformed legacy document should still open through its HTML export.
    }
  }
  return template.bodyHtml ?? markdownToHtml(template.body);
}

function labelForKey(key: string) {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
