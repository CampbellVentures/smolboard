import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach } from "bun:test";

// Make document/window available so @testing-library/react can render. Loaded
// via bunfig.toml's [test] preload, before any test file runs.
GlobalRegistrator.register();

// @testing-library/react reads document at import time, so it can only be
// loaded once the DOM globals above exist.
const { cleanup } = await import("@testing-library/react");

// Every render() mounts into document.body and nothing unmounts it. Leftover
// nodes from one file are visible to the next file's queries, which is how a
// test that passes alone fails in a full run.
afterEach(cleanup);
