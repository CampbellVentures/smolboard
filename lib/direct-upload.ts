import { MAX_DELIVERABLE_BYTES } from "./deliverables";

export interface StoredUpload {
  id: string;
  url: string;
  size: number;
}
export async function uploadFileDirect(file: File): Promise<StoredUpload> {
  if (file.size <= 0) throw new Error("Choose a non-empty file.");
  if (file.size > MAX_DELIVERABLE_BYTES) throw new Error("Files must be 25 MB or smaller.");

  const initResponse = await fetch("/api/files/init", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });
  if (!initResponse.ok) throw new Error("Could not initialize the upload.");
  const initialized = (await initResponse.json()) as { assetId?: string; uploadUrl?: string };
  if (!initialized.assetId || !initialized.uploadUrl) throw new Error("Upload initialization was incomplete.");

  const putResponse = await fetch(initialized.uploadUrl, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!putResponse.ok) throw new Error("Could not transfer the file.");

  const confirmResponse = await fetch("/api/files/confirm", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetId: initialized.assetId }),
  });
  if (!confirmResponse.ok) throw new Error("Could not confirm the upload.");
  const stored = (await confirmResponse.json()) as Partial<StoredUpload>;
  if (!stored.id || !stored.url || typeof stored.size !== "number") {
    throw new Error("Upload confirmation was incomplete.");
  }
  return stored as StoredUpload;
}
