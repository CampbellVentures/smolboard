import { afterEach, expect, test } from "bun:test";
import {
  ReadableStream as NodeReadableStream,
  WritableStream as NodeWritableStream,
} from "node:stream/web";
import React, { createRef } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import {
  EmailComposer,
  type EmailComposerHandle,
} from "../components/email-composer";

afterEach(cleanup);

// happy-dom's stream constructors are not compatible with React DOM Server's
// Node streams, which React Email uses for its export step.
globalThis.ReadableStream = NodeReadableStream as typeof ReadableStream;
globalThis.WritableStream = NodeWritableStream as typeof WritableStream;

test("visual email composer exports editable JSON, HTML, and plain text", async () => {
  const ref = createRef<EmailComposerHandle>();
  let ready = false;

  render(
    <EmailComposer
      ref={ref}
      content={'<p>Hi {{speaker_name}}</p><p><a href="{{portal_link}}">Portal</a></p>'}
      initialDocument={{ html: "", text: "", json: "" }}
      onDocumentChange={() => {}}
      onReadyChange={(value) => {
        ready = value;
      }}
    />,
  );

  await waitFor(() => expect(ready).toBe(true));
  const document = await ref.current!.exportDocument();

  expect(document.text).toContain("Hi {{speaker_name}}");
  expect(document.html).toContain("{{speaker_name}}");
  expect(document.html).toContain('href="{{portal_link}}"');
  expect(JSON.parse(document.json).type).toBe("doc");
});
