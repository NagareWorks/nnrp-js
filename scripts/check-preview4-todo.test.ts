import { assertEquals } from "jsr:@std/assert@1";
import { validatePreview4Todo } from "./check-preview4-todo.ts";

function files(workstream: string, indexChecked = false): ReadonlyMap<string, string> {
  return new Map([
    [
      "implementation-todo.md",
      `# Index\n\n- [${indexChecked ? "x" : " "}] [01 - Work](01-work.md)\n`,
    ],
    ["01-work.md", workstream],
  ]);
}

Deno.test("Preview4 todo validation accepts an open structured plan", () => {
  assertEquals(
    validatePreview4Todo(files("# Work\n\n- [ ] Parent\n  - [x] Finished child\n  - [ ] Open child\n")),
    [],
  );
});

Deno.test("Preview4 todo validation rejects checked parents with open children", () => {
  assertEquals(
    validatePreview4Todo(files("# Work\n\n- [x] Parent\n  - [ ] Open child\n")),
    ["01-work.md:3: checked parent contains unchecked child at line 4"],
  );
});

Deno.test("Preview4 todo validation closes linked workstreams", () => {
  assertEquals(
    validatePreview4Todo(files("# Work\n\n- [ ] Open task\n", true)),
    ["implementation-todo.md:3: checked workstream contains unchecked tasks: 01-work.md"],
  );
});

Deno.test("Preview4 todo validation rejects deferred wording", () => {
  assertEquals(
    validatePreview4Todo(files("# Work\n\n- [ ] Implement when artifacts are available\n")),
    ["01-work.md:3: deferred availability wording"],
  );
});

Deno.test("Preview4 todo validation permits explicit removal of old identifiers", () => {
  assertEquals(
    validatePreview4Todo(files("# Work\n\n- [ ] Remove `webtransport` from the public union\n")),
    [],
  );
});

Deno.test("Preview4 release validation requires every checkbox", () => {
  assertEquals(
    validatePreview4Todo(files("# Work\n\n- [ ] Open task\n"), { requireComplete: true }),
    [
      "implementation-todo.md:3: release requires a checked todo: [01 - Work](01-work.md)",
      "01-work.md:3: release requires a checked todo: Open task",
    ],
  );
});

Deno.test("Preview4 todo validation rejects malformed and oddly indented checkboxes", () => {
  assertEquals(
    validatePreview4Todo(files("# Work\n\n- [?] Broken\n - [ ] Odd indent\n")),
    [
      "01-work.md:3: malformed checkbox",
      "01-work.md:4: checkbox indentation must use two-space levels",
    ],
  );
});

Deno.test("Preview4 todo validation rejects files without tasks", () => {
  assertEquals(
    validatePreview4Todo(files("# Work\n\nNo tasks.\n")),
    ["01-work.md: file contains no todo checkboxes"],
  );
});

Deno.test("Preview4 todo validation rejects missing and orphaned workstreams", () => {
  assertEquals(
    validatePreview4Todo(
      new Map([
        ["implementation-todo.md", "# Index\n\n- [ ] [Missing](01-missing.md)\n"],
        ["02-orphan.md", "# Orphan\n\n- [ ] Task\n"],
      ]),
    ),
    [
      "implementation-todo.md:3: linked workstream does not exist: 01-missing.md",
      "02-orphan.md: workstream is not linked from implementation-todo.md",
    ],
  );
});

Deno.test("Preview4 todo validation requires an index", () => {
  assertEquals(
    validatePreview4Todo(new Map([["01-work.md", "# Work\n\n- [ ] Task\n"]])),
    ["implementation-todo.md: missing Preview4 todo index"],
  );
});

Deno.test("Preview4 todo validation rejects active old API requirements", () => {
  assertEquals(
    validatePreview4Todo(files("# Work\n\n- [ ] Expose `webtransport` in the public union\n")),
    ["01-work.md:3: old Preview API identifier appears as an active requirement"],
  );
});

Deno.test("Preview4 todo validation rejects old-preview compatibility requirements", () => {
  assertEquals(
    validatePreview4Todo(files("# Work\n\n- [ ] Keep backward compatibility aliases\n")),
    ["01-work.md:3: old-preview compatibility requirement is prohibited"],
  );
});
