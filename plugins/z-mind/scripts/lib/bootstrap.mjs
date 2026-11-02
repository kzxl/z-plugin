import fs from "node:fs";
import path from "node:path";

/**
 * Detect language, framework, and project name from workspace files.
 */
export function detectProject(targetDir = process.cwd()) {
  const dir = path.resolve(targetDir);
  let projectName = path.basename(dir).toLowerCase().replace(/[^a-z0-9_\-]/g, "_");
  let language = "general";
  let architecture = "clean_architecture";
  let domain = "engineering";

  try {
    const files = fs.readdirSync(dir);

    // Git detection for project name
    const gitHead = path.join(dir, ".git");
    if (fs.existsSync(gitHead)) {
      projectName = path.basename(dir).toLowerCase().replace(/[^a-z0-9_\-]/g, "_");
    }

    // Language heuristics
    const hasCsproj = files.some(f => f.endsWith(".csproj") || f.endsWith(".sln"));
    const hasPkgJson = files.includes("package.json");
    const hasGoMod = files.includes("go.mod");
    const hasCargo = files.includes("Cargo.toml");
    const hasPy = files.includes("pyproject.toml") || files.includes("requirements.txt") || files.includes("setup.py");
    const hasPhp = files.includes("composer.json");
    const hasCpp = files.includes("CMakeLists.txt") || files.some(f => f.endsWith(".cpp") || f.endsWith(".hpp"));

    if (hasCsproj) {
      language = "csharp";
      architecture = "clean_architecture";
      domain = "enterprise";
    } else if (hasPkgJson) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        if (deps.react || deps["react-dom"] || deps.next) {
          language = "react";
          architecture = "clean_component_architecture";
          domain = "frontend";
        } else {
          language = "nodejs";
          architecture = "clean_api_architecture";
          domain = "backend";
        }
      } catch {
        language = "nodejs";
      }
    } else if (hasGoMod) {
      language = "golang";
      architecture = "clean_service_architecture";
      domain = "distributed";
    } else if (hasCargo) {
      language = "rust";
      architecture = "zero_cost_crate";
      domain = "systems";
    } else if (hasPy) {
      language = "python";
      architecture = "modular_service";
      domain = "ai_backend";
    } else if (hasPhp) {
      language = "php";
      architecture = "psr_clean_architecture";
      domain = "web";
    } else if (hasCpp) {
      language = "cpp";
      architecture = "native_interop";
      domain = "performance";
    }
  } catch (err) {
    // Fallback defaults
  }

  // Determine active rules based on language
  const rules = ["R_CORE", "R_TDD", "R_NEV", "R_PROOF", "R_REUSE", "R_GIT", "R_TEAM"];

  if (language === "csharp") {
    rules.push("R_CS", "R_API", "R_PUB", "R_DB");
  } else if (language === "react") {
    rules.push("R_REACT", "R_UI", "R_ANTI_SLOP");
  } else if (language === "nodejs") {
    rules.push("R_NODE", "R_API");
  } else if (language === "golang") {
    rules.push("R_GO", "R_API");
  } else if (language === "rust") {
    rules.push("R_RUST", "R_PERF");
  } else if (language === "python") {
    rules.push("R_PY", "R_API");
  } else if (language === "php") {
    rules.push("R_PHP", "R_DB");
  } else if (language === "cpp") {
    rules.push("R_CPP", "R_PERF");
  }

  return {
    projectName,
    language,
    architecture,
    domain,
    rules
  };
}

/**
 * Bootstrap or generate a standard .project-rule.md in target directory.
 */
export function bootstrapProjectRule(targetDir = process.cwd(), opts = {}) {
  const dir = path.resolve(targetDir);
  const rulePath = path.join(dir, ".project-rule.md");

  if (fs.existsSync(rulePath) && !opts.force) {
    return {
      success: false,
      alreadyExists: true,
      path: rulePath,
      message: `.project-rule.md already exists at ${rulePath}. Use force=true to overwrite.`
    };
  }

  const detected = detectProject(dir);
  const projectName = opts.projectName || detected.projectName;
  const language = opts.language || detected.language;
  const architecture = opts.architecture || detected.architecture;
  const domain = opts.domain || detected.domain;
  const rules = opts.rules || detected.rules;

  const content = `---
project_name: ${projectName}
domain: ${domain}
primary_language: ${language}
architecture: ${architecture}
framework_references:
  plugin: "z-mind"
  rules: ${JSON.stringify(rules)}
---
# Project Configuration & Engineering Directives (${projectName})

Current Active Project: **${projectName}**

---

## 1. Agent Runtime Configuration (Z-Plugin Suite: z-brain, z-mind, z-token)

### 1.1. Context Lifecycle (Pre-Fetch & Post-Harvest via z-brain)
* **PRE-Fetch (Mandatory before complex tasks):**
  - **MCP Tool:** \`zbrain_fetch(task: "<task_description>", project: "${projectName}")\`
  - **CLI Fallback:**
    \`\`\`bash
    node ~/.gemini/config/plugins/z-brain/scripts/cli.mjs fetch "<task_description>" --project=${projectName}
    \`\`\`
* **POST-Harvest (Mandatory after completing complex tasks):**
  - **MCP Tool:** \`zbrain_harvest(problem: "...", cause: "...", fix: "...", project: "${projectName}", tags: "${domain},${language}")\`
  - **CLI Fallback:**
    \`\`\`bash
    node ~/.gemini/config/plugins/z-brain/scripts/cli.mjs harvest "<problem> | <cause> | <fix>" --project=${projectName} --tags=${domain},${language}
    \`\`\`

### 1.2. Git Safe Staging & Conventional Commits (R_GIT)
* **Safe Staging Rule:** Strictly stage only task-relevant files (\`git add <files>\`). Sweeping \`git add -A\` is STRICTLY PROHIBITED.
* **Commit Discipline:** Strictly follow Conventional Commits (\`R_GIT\`): \`<type>(<scope>): <subject>\`.

### 1.3. Engineering Invariants & Quality Gate (z-mind)
* **Rules Lookup:** Query rule definitions via \`zmind_rules <topic>\` (or CLI: \`node ~/.gemini/config/plugins/z-mind/scripts/cli.mjs rules <topic>\`).
* **Plan Audit:** Run \`zmind_audit\` on implementation plans or commit messages to enforce TDD reproduction gates and clean abstractions.
* **Core Invariants:**
  - \`R_TDD\`: Failing reproduction test first before modifying production code.
  - \`R_NEV\`: Net Engineering Value gate (prohibit wrapper hell, single-impl interfaces).
  - \`R_PROOF\`: Empirical proof required (compiler code 0, test assertion counts).
  - \`R_REUSE\`: Survey existing project helpers before writing custom utilities.
`;

  fs.writeFileSync(rulePath, content, "utf8");

  // Keep .project-rule.md in .gitignore if .gitignore exists
  const gitignorePath = path.join(dir, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const gi = fs.readFileSync(gitignorePath, "utf8");
    if (!gi.includes(".project-rule.md")) {
      fs.appendFileSync(gitignorePath, "\n# Z-Plugin Local Project Directives\n.project-rule.md\n", "utf8");
    }
  }

  return {
    success: true,
    alreadyExists: false,
    path: rulePath,
    projectName,
    language,
    domain,
    rules,
    message: `Generated standard .project-rule.md at ${rulePath} for project '${projectName}' (${language}).`
  };
}
