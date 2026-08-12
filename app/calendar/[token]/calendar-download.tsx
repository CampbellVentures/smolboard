"use client";

import React, { useEffect, useState } from "react";
import { callFn } from "@pylonsync/react";

import { CalendarDays, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Invite {
  filename: string;
  content: string;
  title: string;
  start: string;
  end: string;
  urls: { ics: string; google: string; outlook: string };
}

export function CalendarDownload({ token }: { token: string }) {
  const [invite, setInvite] = useState<Invite | null | undefined>();
  useEffect(() => {
    let active = true;
    callFn<Invite | null>("getCalendarInvite", { token })
      .then((value) => active && setInvite(value))
      .catch(() => active && setInvite(null));
    return () => {
      active = false;
    };
  }, [token]);

  function download() {
    if (!invite) return;
    const url = URL.createObjectURL(new Blob([invite.content], { type: "text/calendar;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = invite.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <CalendarDays className="size-5" />
          </div>
          <CardTitle>{invite === undefined ? "Loading invitation…" : invite?.title ?? "Invitation unavailable"}</CardTitle>
          <CardDescription>
            {invite
              ? new Date(invite.start).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })
              : invite === null
                ? "This calendar link is invalid or no longer available."
                : "Preparing your calendar options."}
          </CardDescription>
        </CardHeader>
        {invite ? (
          <CardContent className="flex flex-col gap-3">
            <Button type="button" onClick={download}>
              <Download data-icon="inline-start" /> Download .ics
            </Button>
            <Button asChild variant="outline">
              <a href={invite.urls.google} target="_blank" rel="noreferrer">
                <ExternalLink data-icon="inline-start" /> Add to Google Calendar
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={invite.urls.outlook} target="_blank" rel="noreferrer">
                <ExternalLink data-icon="inline-start" /> Add to Outlook
              </a>
            </Button>
          </CardContent>
        ) : null}
      </Card>
    </main>
  );
}
