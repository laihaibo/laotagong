import { beforeEach } from "vitest";

// jsdom backs window.localStorage, so tests exercise the real load/save path.
// Reset it before every test so specs stay order-independent.
beforeEach(() => {
  window.localStorage.clear();
});
