const todoRoot = "doc/todo/v1-preview3";
const unchecked: string[] = [];

for await (const entry of Deno.readDir(todoRoot)) {
  if (!entry.isFile || !entry.name.endsWith(".md")) {
    continue;
  }

  const path = `${todoRoot}/${entry.name}`;
  const lines = (await Deno.readTextFile(path)).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes("[ ]")) {
      unchecked.push(`${path}:${index + 1}: ${lines[index].trim()}`);
    }
  }
}

if (unchecked.length > 0) {
  console.error("Preview3 todo is not complete:");
  for (const item of unchecked) {
    console.error(`- ${item}`);
  }
  Deno.exit(1);
}
