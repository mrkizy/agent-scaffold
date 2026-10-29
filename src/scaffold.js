import { access, chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROLES, REVIEWER_ROLES } from "./catalog.js";
import { createManifest, MANIFEST_PATH, hashContent } from "./manifest.js";
import { readTemplate, renderTemplate } from "./templates.js";

const PROJECT_PROMPTS = ".cao/project-prompts";

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

function profileName(role) {
  return role.id;
}

function renderProfile(role, provider, model, providerSettings, prompt, selectedRoles, providers, models) {
  const caoRole = role.kind === "supervisor" ? "supervisor" : role.kind === "developer" ? "developer" : "reviewer";
  const mcp = role.kind === "supervisor" ? `\nallowedTools:\n  - "@cao-mcp-server"\n  - fs_read\n  - fs_list\n  - discovery\nmcpServers:\n  cao-mcp-server:\n    type: stdio\n    command: cao-mcp-server\n    args: []` : "";
  const modelField = model ? `\nmodel: ${JSON.stringify(model)}` : "";
  const configField = provider === "codex" && providerSettings?.model_reasoning_effort
    ? `\ncodexConfig:\n  model_reasoning_effort: ${providerSettings.model_reasoning_effort}`
    : provider === "claude_code" && providerSettings?.effort
      ? `\nclaudeConfig:\n  effort: ${providerSettings.effort}`
      : "";
  const availableRoles = role.kind === "supervisor"
    ? `\n\n## 本项目已创建的角色\n\n${selectedRoles.map((id) => `- ${id}：provider=${JSON.stringify(providers[id])}；model=${JSON.stringify(models[id] || "provider 默认模型")}`).join("\n")}\n`
    : "";
  return `---\nname: ${profileName(role)}\ndescription: ${role.description}\nrole: ${caoRole}\nprovider: ${provider}${modelField}${configField}${mcp}\n---\n\n${prompt.trim()}${availableRoles}\n开始工作前先读项目根目录 AGENTS.md（若不存在，再读 CLAUDE.md），并读取 .cao/project-prompts/${role.id}.md。\n`;
}

function projectPrompt(role) {
  return `# ${role.label}：项目补充要求\n\n> 只写本项目特有的约定、背景、边界和验收规则。通用职责由 CAO profile 提供。\n\n## 项目背景\n\n待填写。\n\n## 必须遵守\n\n- 待填写。\n\n## 验收补充\n\n- 待填写。\n`;
}

export async function buildArtifacts({ selectedRoles, providers, models = {}, providerSettings = {} }) {
  const files = {};
  const selected = new Set(selectedRoles);
  for (const role of ROLES.filter((item) => selected.has(item.id))) {
    const prompt = await readTemplate(`roles/${role.id}.md`);
    files[`.cao/agent-store/${role.id}.md`] = renderProfile(role, providers[role.id], models[role.id], providerSettings[role.id], prompt, selectedRoles, providers, models);
    files[`${PROJECT_PROMPTS}/${role.id}.md`] = projectPrompt(role);
  }
  files[`${PROJECT_PROMPTS}/review-standards.md`] = await readTemplate("project-prompts/review-standards.md");
  const workflowTemplate = await readTemplate("workflows/review_pipeline.py");
  const reviewerIds = REVIEWER_ROLES.filter((role) => selected.has(role.id)).map((role) => role.id);
  const workflow = renderTemplate(workflowTemplate, {
    CONFIG_JSON: JSON.stringify(JSON.stringify({
      selected_roles: [...selected],
      reviewers: reviewerIds,
      providers,
      models,
      provider_settings: providerSettings,
    })),
  });
  files[".cao/workflows/agent_review.py"] = workflow;
  files[".cao/start-server.sh"] = `#!/bin/sh\nset -eu\nPROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)\nexport CAO_HOME_DIR="$PROJECT_ROOT/.cao"\ncd "$PROJECT_ROOT"\nexec cao-server "$@"\n`;
  if (selected.has("code_supervisor")) {
    files[".cao/launch-supervisor.sh"] = `#!/bin/sh\nset -eu\nPROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)\nexport CAO_HOME_DIR="$PROJECT_ROOT/.cao"\ncd "$PROJECT_ROOT"\nexec cao launch --agents code_supervisor --provider ${providers.code_supervisor} "$@"\n`;
  }
  return files;
}

async function backupFile(target) {
  const backup = `${target}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await rename(target, backup);
  return backup;
}

export async function writeArtifacts(projectRoot, files, { replace = false, updateFrom, selectedRoles, providers, models = {}, providerSettings = {} } = {}) {
  const written = [];
  const previousHashes = updateFrom?.generatedFiles ?? {};
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(projectRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    if (await exists(target)) {
      const existing = await readFile(target, "utf8");
      const isUneditedGeneratedFile = previousHashes[relativePath] === hashContent(existing);
      if (!replace && !isUneditedGeneratedFile) continue;
      if (existing === content) continue;
      await backupFile(target);
    }
    await writeFile(target, content, "utf8");
    written.push(relativePath);
  }
  const generatedFiles = Object.fromEntries(Object.entries(files).map(([name, value]) => [name, value]));
  const manifest = createManifest({ selectedRoles, providers, models, providerSettings, generatedFiles, updateFrom });
  const manifestPath = path.join(projectRoot, MANIFEST_PATH);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  if (await exists(manifestPath)) {
    if (!replace && !updateFrom) throw new Error("项目已有脚手架 manifest，请运行 agent-scaffold update。");
    await backupFile(manifestPath);
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  for (const relativePath of written.filter((name) => name.endsWith(".sh"))) {
    await chmod(path.join(projectRoot, relativePath), 0o755);
  }
  return written;
}

export async function writeManifest(projectRoot, manifest) {
  const manifestPath = path.join(projectRoot, MANIFEST_PATH);
  const temporaryPath = `${manifestPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporaryPath, manifestPath);
}

export async function readManifest(projectRoot) {
  const manifest = JSON.parse(await readFile(path.join(projectRoot, MANIFEST_PATH), "utf8"));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.selectedRoles) || !manifest.providers || !manifest.generatedFiles) {
    throw new Error("脚手架 manifest 格式无效。");
  }
  for (const relativePath of Object.keys(manifest.generatedFiles)) {
    if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) {
      throw new Error("manifest 含有项目目录外的路径：" + relativePath);
    }
  }
  return manifest;
}

export function verifyManifestFiles(projectRoot, manifest) {
  return Promise.all(Object.entries(manifest.generatedFiles).map(async ([relativePath, expected]) => {
    const fullPath = path.join(projectRoot, relativePath);
    if (!(await exists(fullPath))) return { path: relativePath, state: "missing" };
    const actual = hashContent(await readFile(fullPath, "utf8"));
    return { path: relativePath, state: actual === expected ? "unchanged" : "edited" };
  }));
}
