const DEFAULT_TODO_ROOT = "doc/todo/v1-preview4";
const INDEX_FILE = "implementation-todo.md";

interface TodoEntry {
  readonly line: number;
  readonly indent: number;
  readonly checked: boolean;
  readonly text: string;
}

export interface Preview4TodoValidationOptions {
  readonly requireComplete?: boolean;
}

export function validatePreview4Todo(
  files: ReadonlyMap<string, string>,
  options: Preview4TodoValidationOptions = {},
): readonly string[] {
  const issues: string[] = [];
  const parsed = new Map<string, readonly TodoEntry[]>();

  for (const [path, content] of files) {
    const entries = parseTodoEntries(path, content, issues);
    parsed.set(path, entries);
    validateParentClosure(path, entries, issues);
    validateVocabulary(path, content, issues);

    if (options.requireComplete) {
      for (const entry of entries) {
        if (!entry.checked) {
          issues.push(`${path}:${entry.line}: release requires a checked todo: ${entry.text}`);
        }
      }
    }
  }

  validateIndex(files, parsed, issues);
  return issues;
}

async function loadTodoFiles(root: string): Promise<ReadonlyMap<string, string>> {
  const files = new Map<string, string>();
  for await (const entry of Deno.readDir(root)) {
    if (!entry.isFile || !entry.name.endsWith(".md")) {
      continue;
    }
    files.set(entry.name, await Deno.readTextFile(`${root}/${entry.name}`));
  }
  return files;
}

function parseTodoEntries(path: string, content: string, issues: string[]): readonly TodoEntry[] {
  const entries: TodoEntry[] = [];
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const malformed = line.match(/^(\s*)-\s*\[[^ xX\]]?\]/);
    if (malformed) {
      issues.push(`${path}:${index + 1}: malformed checkbox`);
      continue;
    }

    const match = line.match(/^(\s*)- \[([ xX])\] (.+)$/);
    if (!match) {
      continue;
    }

    const indent = match[1].replaceAll("\t", "  ").length;
    if (indent % 2 !== 0) {
      issues.push(`${path}:${index + 1}: checkbox indentation must use two-space levels`);
    }

    entries.push({
      line: index + 1,
      indent,
      checked: match[2].toLowerCase() === "x",
      text: match[3],
    });
  }

  if (entries.length === 0) {
    issues.push(`${path}: file contains no todo checkboxes`);
  }
  return entries;
}

function validateParentClosure(path: string, entries: readonly TodoEntry[], issues: string[]): void {
  const stack: TodoEntry[] = [];

  for (const entry of entries) {
    while (stack.length > 0 && stack[stack.length - 1].indent >= entry.indent) {
      stack.pop();
    }

    if (!entry.checked) {
      const checkedParent = stack.findLast((candidate) => candidate.checked);
      if (checkedParent) {
        issues.push(
          `${path}:${checkedParent.line}: checked parent contains unchecked child at line ${entry.line}`,
        );
      }
    }
    stack.push(entry);
  }
}

function validateVocabulary(path: string, content: string, issues: string[]): void {
  const deferredPatterns: readonly [RegExp, string][] = [
    [/待冻结|未冻结/u, "unfrozen contract wording"],
    [/等.{0,40}后(?:再)?实现/u, "deferred implementation wording"],
    [/\b(?:when|once)\b.{0,80}\b(?:is|are|becomes?|exist)\b.{0,20}\bavailable\b/i, "deferred availability wording"],
    [/\bwhere\b.{0,60}\bsupported\b/i, "conditional support wording"],
    [/\bTBD\b/i, "TBD wording"],
  ];
  const oldApiPattern = /`(?:transport-ws|webtransport|score|tcp-only|quic-only)`/i;
  const removalPattern = /\b(?:remove|reject|do not|must not)\b|删除|拒绝|不得|禁止/i;

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    for (const [pattern, label] of deferredPatterns) {
      if (pattern.test(line)) {
        issues.push(`${path}:${index + 1}: ${label}`);
      }
    }
    if (oldApiPattern.test(line) && !removalPattern.test(line)) {
      issues.push(`${path}:${index + 1}: old Preview API identifier appears as an active requirement`);
    }
    if (/\b(?:backwards?|old-preview) compatibility\b/i.test(line) && !removalPattern.test(line)) {
      issues.push(`${path}:${index + 1}: old-preview compatibility requirement is prohibited`);
    }
  }
}

function validateIndex(
  files: ReadonlyMap<string, string>,
  parsed: ReadonlyMap<string, readonly TodoEntry[]>,
  issues: string[],
): void {
  const index = files.get(INDEX_FILE);
  if (index === undefined) {
    issues.push(`${INDEX_FILE}: missing Preview4 todo index`);
    return;
  }

  const linked = new Set<string>();
  for (const entry of parsed.get(INDEX_FILE) ?? []) {
    const match = entry.text.match(/\]\(([^)]+\.md)\)/);
    if (!match) {
      continue;
    }
    const target = match[1];
    linked.add(target);
    const targetEntries = parsed.get(target);
    if (!files.has(target) || targetEntries === undefined) {
      issues.push(`${INDEX_FILE}:${entry.line}: linked workstream does not exist: ${target}`);
      continue;
    }
    if (entry.checked && targetEntries.some((targetEntry) => !targetEntry.checked)) {
      issues.push(`${INDEX_FILE}:${entry.line}: checked workstream contains unchecked tasks: ${target}`);
    }
  }

  for (const path of files.keys()) {
    if (path !== INDEX_FILE && !linked.has(path)) {
      issues.push(`${path}: workstream is not linked from ${INDEX_FILE}`);
    }
  }
}

if (import.meta.main) {
  const requireComplete = Deno.args.includes("--require-complete");
  const files = await loadTodoFiles(DEFAULT_TODO_ROOT);
  const issues = validatePreview4Todo(files, { requireComplete });

  if (issues.length > 0) {
    console.error(`Preview4 todo validation failed (${issues.length} issue${issues.length === 1 ? "" : "s"}):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    Deno.exit(1);
  }

  console.log(
    requireComplete
      ? `Preview4 todo is structurally valid and complete (${files.size} files).`
      : `Preview4 todo is structurally valid (${files.size} files).`,
  );
}
