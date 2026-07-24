import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const ciWorkflow = await Deno.readTextFile(".github/workflows/ci.yml");

Deno.test("commit policy preserves develop-to-main history without weakening feature PRs", () => {
  assertStringIncludes(ciWorkflow, 'base_ref="${{ github.base_ref }}"');
  assertStringIncludes(ciWorkflow, 'head_ref="${{ github.head_ref }}"');
  assertStringIncludes(ciWorkflow, 'if [[ "$base_ref" == "main" && "$head_ref" == "develop" ]]; then');
  assertStringIncludes(ciWorkflow, 'if [[ "$integration_pr" != "true" && "$count" -ne 1 ]]; then');
  assertStringIncludes(ciWorkflow, 'done < <(git log --format=%s "$range")');
  assertEquals(ciWorkflow.includes('if [[ "$count" -ne 1 ]]'), false);
});
