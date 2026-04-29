import { query } from "@anthropic-ai/claude-agent-sdk";

const toolName = 'syncthing';
const toolHomepage = 'https://docs.syncthing.net/'
const description = 'Make sure that the resources created allow the usage and configuration of syncthing directly. Syncthing has a CLI so this should be possible.'

const researchResults: string[] = [];

for await (const message of query({
  prompt:
    `Research and design a Codify resource for ${toolName} (the homepage is: ${toolHomepage})
    
${description}

The research should include:
** The installation method **
- The installation method for the tool of application (in the case ${toolName})
- The installation method should be the most standard installation method.
- Find the installation instructions for both macOS and Linux.

** Dependencies **
- Any dependencies or prerequisites for installation

** Configuration **
- Any configuration options or settings for the tool
- Any settings that we want the user to manage (which will later be exposed as parameters in the Codify resource)
- The default values for these settings

** Usages **
- Examples of how the tool can be used
- Any common use cases or scenarios
- Any use case we want to manage via the Codify resource or sub-resources or stateful parameters
- For example:
  - The homebrew resource installs homebrew but it also has the formulae and casks stateful parameters that manage installed packages.
  - The asdf resource installs asdf, a tool version manager, but it also has the plugins stateful parameter that manages installed plugins.
  - The asdf resource has sub resources for installing tool plugins and versions.

The purpose of this research is to be used later by Claude to create the resources needed in code. Format the answer so that
it can be easily understood by Claude.
  `,
  options: {
    settingSources: ['project'],
    allowedTools: ["WebSearch", "WebFetch"],
    mcpServers: {},
    permissionMode: 'plan',
    cwd: '../'
  }
})) {
  // Print human-readable output
  if (message.type === "assistant" && message.message?.content) {
    for (const block of message.message.content) {
      if ("text" in block) {
        console.log(block.text); // Claude's reasoning
        researchResults.push(block.text);
      } else if ("name" in block) {
        console.log(`Tool: ${block.name}`); // Tool being called
      }
    }
  } else if (message.type === "result") {
    console.log(`Done: ${message.subtype}`); // Final result
  }
}

// Checkout a new git branch
// Launch a new docker container

for await (const message of query({
  prompt: `Use the research results to design a Codify resource for ${toolName} (the homepage is: ${toolHomepage}).
  
${description}
  
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
// - Run the test using 'npm run test:integration:dev -- $PathToTheTestFile'. Make sure the $PathToTheTestFile is replaced with the relative path to the test file.
// - Do not try to test the code in any other ways. It may brick the current computer if you do.

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
