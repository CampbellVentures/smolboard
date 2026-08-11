import React from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { CalendarDownload } from "./calendar-download";

export const metadata: Metadata = { title: "Add session to calendar · smolboard", robots: "noindex" };

export default function CalendarPage({ params }: PageProps<{ token: string }>) {
  return <CalendarDownload token={params.token} />;
}
