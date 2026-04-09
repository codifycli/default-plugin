import { query } from "@anthropic-ai/claude-agent-sdk";

const toolName = 'uv';
const toolHomepage = 'https://docs.astral.sh/uv/#projects'

const researchResults = [
`Here's a summary of the research and proposed design:

---

## \`uv\` Resource Design

### What was researched
- **uv** is a blazing-fast Python tool from Astral that replaces pip, pyenv, pipx, poetry, and virtualenv in one binary.

---

### Installation
| Platform | Method |
|---|---|
| macOS | \`brew install uv\` (Homebrew, preferred since Codify users likely have it) |
| Linux | \`curl -LsSf https://astral.sh/uv/install.sh \\| sh\` with \`UV_NO_MODIFY_PATH=1\`, then manually add \`~/.local/bin\` to shell rc |

No Rust or Python required. No other OS-level dependencies beyond curl on Linux.

---

### Proposed Resources

**One resource: \`uv\`** (located at \`src/resources/python/uv/\`)

| Parameter | Type | Description |
|---|---|---|
| \`pythonVersions\` | Stateful \`string[]\` | Python versions to install via \`uv python install\` (e.g. \`["3.12", "3.11"]\`) |
| \`tools\` | Stateful \`string[]\` | CLI tools installed globally via \`uv tool install\` (e.g. \`["ruff", "black"]\`) |

This follows the same pattern as **pyenv** (install tool + manage Python versions) and **NVM** (install tool + manage versions as stateful parameter).

---

### Key Design Decisions

1. **Homebrew dependency on macOS** — Declared via \`dependencies: ['homebrew']\` mirroring the \`asdf\` resource pattern.
2. **Two stateful parameters** — \`pythonVersions\` (parsed from \`uv python list --only-installed\`) and \`tools\` (parsed from \`uv tool list\`).
3. **Version prefix matching** — Desired \`"3.12"\` matches installed \`"3.12.3"\` using \`startsWith\` in \`isElementEqual\`.
4. **No sub-resources** — Unlike asdf (which has \`asdf-plugin\` and \`asdf-install\` sub-resources), uv's tool and Python management is simple enough to handle as stateful parameters on the main resource.
`
];

// for await (const message of query({
//   prompt:
//     `Research and design a Codify resource for ${toolName} (the homepage is: ${toolHomepage})
//
// The research should include:
// ** The installation method **
// - The installation method for the tool of application (in the case ${toolName})
// - The installation method should be the most standard installation method.
// - Find the installation instructions for both macOS and Linux.
//
// ** Dependencies **
// - Any dependencies or prerequisites for installation
//
// ** Configuration **
// - Any configuration options or settings for the tool
// - Any settings that we want the user to manage (which will later be exposed as parameters in the Codify resource)
// - The default values for these settings
//
// ** Usages **
// - Examples of how the tool can be used
// - Any common use cases or scenarios
// - Any use case we want to manage via the Codify resource or sub-resources or stateful parameters
// - For example:
//   - The homebrew resource installs homebrew but it also has the formulae and casks stateful parameters that manage installed packages.
//   - The asdf resource installs asdf, a tool version manager, but it also has the plugins stateful parameter that manages installed plugins.
//   - The asdf resource has sub resources for installing tool plugins and versions.
//
// The purpose of this research is to be used later by Claude to create the resources needed in code. Format the answer so that
// it can be easily understood by Claude.
//   `,
//   options: {
//     settingSources: ['project'],
//     allowedTools: ["WebSearch", "WebFetch"],
//     mcpServers: {},
//     permissionMode: 'plan',
//     cwd: '../'
//   }
// })) {
//   // Print human-readable output
//   if (message.type === "assistant" && message.message?.content) {
//     for (const block of message.message.content) {
//       if ("text" in block) {
//         console.log(block.text); // Claude's reasoning
//         researchResults.push(block.text);
//       } else if ("name" in block) {
//         console.log(`Tool: ${block.name}`); // Tool being called
//       }
//     }
//   } else if (message.type === "result") {
//     console.log(`Done: ${message.subtype}`); // Final result
//   }
// }

// Checkout a new git branch
// Launch a new docker container

for await (const message of query({
  prompt: `Use the research results to design a Codify resource for ${toolName} (the homepage is: ${toolHomepage}).
  
Guidelines:
- Follow the other tools in the project under @src/resources/** as a guideline
- Prefer to use Zod over JSON Schema  
- Remember to write tests, follow the other test examples under @test/** as a guideline
- Keep the resource simple and focused on the core functionality of ${toolName}
- Use the research to guide the software design
- Remember to split up functions if they get too long and complicated to understand. Create helper functions instead with idiomatic names.

Steps:
- Write code to fulfill the requirements laid out in the research.
- Add the resource to @src/index.ts so that it is visible
- Write tests for the code to test ${toolName}
- Ensure typescript is correct using tsx
- Run the test using 'npm run test:integration:dev -- $PathToTheTestFile'
- Do not try to test the code in any other ways. It may brick the current computer if you do.

Research:
${researchResults.join('\n\n')}
  `,
  options: {
    settingSources: ['project'],
    permissionMode: "bypassPermissions", // Auto-approve file edits
    cwd: '../'
  }
})) {
  // Print human-readable output
  if (message.type === "assistant" && message.message?.content) {
    for (const block of message.message.content) {
      if ("text" in block) {
        console.log(block.text); // Claude's reasoning
      } else if ("name" in block) {
        console.log(`Tool: ${block.name}`); // Tool being called
      }
    }
  } else if (message.type === "result") {
    console.log(`Done: ${message.subtype}`); // Final result
  }
}
