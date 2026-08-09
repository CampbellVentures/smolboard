import { request as nodeRequest } from "node:http";

// happy-dom intentionally installs a browser-like fetch for component tests.
// HTTP characterization tests use Node's transport directly so CORS emulation
// cannot block safe loopback requests.
export function loopbackRequest(url: string, init: RequestInit = {}): Promise<Response> {
  const target = new URL(url);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1") {
    throw new Error(`HTTP tests refuse non-loopback target: ${target.origin}`);
  }
  const headers = new Headers(init.headers);
  const body =
    typeof init.body === "string"
      ? init.body
      : init.body instanceof ArrayBuffer
        ? Buffer.from(init.body)
        : ArrayBuffer.isView(init.body)
          ? Buffer.from(init.body.buffer, init.body.byteOffset, init.body.byteLength)
          : undefined;

  return new Promise((resolve, reject) => {
    const request = nodeRequest(
      target,
      {
        method: init.method ?? "GET",
        headers: Object.fromEntries(headers.entries()),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode ?? 500,
              headers: response.headers as HeadersInit,
            }),
          );
        });
      },
    );
    request.once("error", reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}
