import { expect, test } from "bun:test";
import { buildZip, crc32, zipSafeName } from "../lib/zip";

test("crc32 matches known vectors", () => {
  const enc = new TextEncoder();
  expect(crc32(enc.encode(""))).toBe(0x00000000);
  expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
  expect(crc32(enc.encode("hello"))).toBe(0x3610a686);
});

test("zipSafeName strips hostile characters, keeps folders", () => {
  expect(zipSafeName('Ada Lovelace/deck: "final".pdf')).toBe("Ada Lovelace/deck_ _final_.pdf");
  expect(zipSafeName("..\\..\\evil")).toBe("_/_/evil");
});

test("buildZip produces an archive Bun can round-trip via zipfile signature checks", () => {
  const enc = new TextEncoder();
  const zip = buildZip([
    { name: "a/one.txt", data: enc.encode("first file") },
    { name: "two.txt", data: enc.encode("second") },
  ]);
  const view = new DataView(zip.buffer);
  expect(view.getUint32(0, true)).toBe(0x04034b50); // local header magic
  expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50); // EOCD magic
  expect(view.getUint16(zip.length - 22 + 10, true)).toBe(2); // total entries
  // Central directory offset points at a central header.
  const centralStart = view.getUint32(zip.length - 22 + 16, true);
  expect(view.getUint32(centralStart, true)).toBe(0x02014b50);
});

test("python zipfile can extract the archive", async () => {
  const enc = new TextEncoder();
  const zip = buildZip([{ name: "speaker/deck.pdf", data: enc.encode("%PDF-1.4 test") }]);
  const path = "/tmp/smolboard-zip-test.zip";
  await Bun.write(path, zip);
  const proc = Bun.spawnSync([
    "python3",
    "-c",
    `import zipfile;z=zipfile.ZipFile("${path}");assert z.testzip() is None;assert z.read("speaker/deck.pdf")==b"%PDF-1.4 test";print("ok")`,
  ]);
  expect(proc.stdout.toString().trim()).toBe("ok");
});
