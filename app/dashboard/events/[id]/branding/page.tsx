import React, { use } from "react";
import { type Metadata, type PageProps } from "@pylonsync/react";
import { BrandingPage } from "./branding-client";
import type { EventRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Branding — smolboard",
  robots: "noindex",
};

export default function EventBrandingPage({
  auth,
  params,
  response,
  serverData,
}: PageProps<{ id: string }>) {
  if (!auth.tenant_id) {
    response.redirect("/dashboard");
    return null;
  }
  const event = use(serverData.get<EventRow>("Event", params.id));
  if (!event || event.orgId !== auth.tenant_id) {
    response.notFound();
    return null;
  }
  return <BrandingPage event={event} />;
}
