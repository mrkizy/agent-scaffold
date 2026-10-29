#!/usr/bin/env node
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PROVIDERS, ROLES } from "./catalog.js";
import { Prompts } from "./prompts.js";
import { buildArtifacts, readManifest, verifyManifestFiles, writeArtifacts, writeManifest } from "./scaffold.js";
import { hashContent } from "./manifest.js";

const usage = "agent-scaffold: init | validate | update | workflow install | run | status | result | cancel | resume";
const WORKFLOW_NAME = "agent_scaffold_review";

async function projectArg(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--task" || arg === "--approved-plan") { index += 1; continue; }
    if (arg.startsWith("--")) continue;
    try { if ((await stat(arg)).isDirectory()) return path.resolve(arg); } catch { /* not a directory */ }
  }
  return process.cwd();
}

function runCao(projectRoot, args) {
  const result = spawnSync("cao", args, {
    cwd: projectRoot,
    env: { ...process.env, CAO_HOME_DIR: path.join(projectRoot, ".cao") },
    stdio: "inherit",
  });
  if (result.error) throw new Error("无法启动 cao：" + result.error.message);
  if (result.status !== 0) throw new Error("cao " + args.join(" ") + " 退出码：" + result.status);
}

function captureCao(projectRoot, args) {
  const result = spawnSync("cao", args, {
    cwd: projectRoot,
    env: { ...process.env, CAO_HOME_DIR: path.join(projectRoot, ".cao") },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (result.error) throw new Error("无法启动 cao：" + result.error.message);
  if (result.status !== 0) throw new Error("cao " + args.join(" ") + " 退出码：" + result.status);
  return result.stdout;
}

async function init(projectRoot, updating = false) {
  const prompts = new Prompts();
  try {
    console.log("目标项目：" + projectRoot);
    let previousManifest;
    if (updating) previousManifest = await readManifest(projectRoot);
    else {
      let hasManifest = true;
      try { await access(path.join(projectRoot, ".cao/scaffold.json")); } catch { hasManifest = false; }
      if (hasManifest) throw new Error("项目已有脚手架 manifest，请运行 agent-scaffold update。");
    }
    const defaults = previousManifest?.selectedRoles ?? ROLES.filter((role) => role.defaultSelected).map((role) => role.id);
    const selectedRoles = await prompts.chooseMany("选择需要创建的角色", ROLES, { defaults });
    if (!selectedRoles) return;
    if (!selectedRoles.includes("code_supervisor") || !selectedRoles.includes("developer")) {
      throw new Error("完整运行时需要同时创建 code_supervisor 和 developer。");
    }
    const providers = {};
    const models = {};
    const providerSettings = {};
    for (const role of ROLES.filter((item) => selectedRoles.includes(item.id))) {
      const defaultProvider = previousManifest?.providers?.[role.id] ?? (role.id === "developer" ? "cursor_cli" : "claude_code");
      const providerChoices = [...PROVIDERS];
      if (!PROVIDERS.some((provider) => provider.id === defaultProvider)) {
        providerChoices.push({ id: defaultProvider, label: "已配置：" + defaultProvider, description: "保留自定义 provider" });
      }
      providerChoices.push({ id: "custom", label: "自定义 provider…", description: "手动输入 CAO provider ID" });
      const providerChoice = await prompts.chooseOne(role.label + " 使用哪个 provider？", providerChoices, { defaultValue: defaultProvider });
      if (!providerChoice) return;
      providers[role.id] = providerChoice === "custom"
        ? await prompts.text("输入 CAO provider ID", { defaultValue: defaultProvider })
        : providerChoice;
      if (!/^[A-Za-z0-9_-]+$/.test(providers[role.id])) throw new Error("provider 只能包含英文、数字、下划线和连字符：" + role.id);
      const sameProvider = previousManifest?.providers?.[role.id] === providers[role.id];
      const previousModel = sameProvider ? previousManifest?.models?.[role.id] ?? "" : "";
      const suggestedModel = providers[role.id] === "cursor_cli" ? "grok-4.7" : providers[role.id] === "codex" ? "gpt-6-luna" : "";
      const modelChoices = [{ id: "default", label: "沿用 provider 默认模型" }];
      if (suggestedModel && suggestedModel !== previousModel) modelChoices.push({ id: "suggested", label: suggestedModel, description: "本机常用模型" });
      if (previousModel) modelChoices.push({ id: "previous", label: previousModel, description: "保持上次设置" });
      modelChoices.push({ id: "custom", label: "输入其他模型 ID…" });
      const modelChoice = await prompts.chooseOne(role.label + " 使用哪个模型？", modelChoices, {
        defaultValue: previousModel ? "previous" : suggestedModel ? "suggested" : "default",
      });
      if (!modelChoice) return;
      models[role.id] = modelChoice === "suggested" ? suggestedModel : modelChoice === "previous" ? previousModel : modelChoice === "custom"
        ? await prompts.text("输入模型 ID（留空则沿用 provider 默认）", { defaultValue: previousModel })
        : "";

      const priorSettings = sameProvider ? previousManifest?.providerSettings?.[role.id] ?? {} : {};
      if (providers[role.id] === "codex") {
        const effort = await prompts.chooseOne(role.label + " 的 Codex 推理强度", [
          { id: "low", label: "低" }, { id: "medium", label: "中" }, { id: "high", label: "高" }, { id: "xhigh", label: "超高" },
        ], { defaultValue: priorSettings.model_reasoning_effort ?? "medium" });
        if (!effort) return;
        providerSettings[role.id] = { model_reasoning_effort: effort };
      } else if (providers[role.id] === "claude_code") {
        const effort = await prompts.chooseOne(role.label + " 的 Claude Code effort", [
          { id: "low", label: "低" }, { id: "medium", label: "中" }, { id: "high", label: "高" }, { id: "xhigh", label: "超高" },
        ], { defaultValue: priorSettings.effort ?? "medium" });
        if (!effort) return;
        providerSettings[role.id] = { effort };
      }
    }
    const files = await buildArtifacts({ selectedRoles, providers, models, providerSettings });
    const collisions = [];
    console.log("\n角色配置预览：");
    for (const role of ROLES.filter((item) => selectedRoles.includes(item.id))) {
      const model = models[role.id] || "provider 默认模型";
      const setting = providerSettings[role.id]?.model_reasoning_effort ?? providerSettings[role.id]?.effort;
      console.log("  " + role.id + " → " + providers[role.id] + " / " + model + (setting ? " / 推理强度 " + setting : ""));
    }
    console.log("\n文件写入预览：");
    for (const name of Object.keys(files)) {
      const target = path.join(projectRoot, name);
      let exists = true;
      try { await access(target); } catch { exists = false; }
      if (exists) {
        collisions.push(name);
        const previousHash = previousManifest?.generatedFiles?.[name];
        const currentHash = hashContent(await readFile(target, "utf8"));
        const label = previousHash === currentHash ? "脚手架未改" : previousHash ? "项目已修改" : "已有文件";
        console.log("  " + label + "  " + name);
      } else {
        console.log("  新建      " + name);
      }
    }
    if (collisions.length) {
      console.log((updating ? "已有文件（未编辑模板会更新，项目修改会保留）：\n  " : "已有文件（默认保留）：\n  ") + collisions.join("\n  "));
    }
    const replaceQuestion = updating ? "是否也备份并覆盖你手动修改过的文件？" : "是否备份并覆盖以上已有文件？";
    const replace = collisions.length && await prompts.confirm(replaceQuestion, { defaultValue: false });
    const written = await writeArtifacts(projectRoot, files, { replace, updateFrom: previousManifest, selectedRoles, providers, models, providerSettings });
    console.log("已写入或更新 " + written.length + " 个文件；保留 " + (Object.keys(files).length - written.length) + " 个已有文件。");
    console.log("Manifest: " + path.join(projectRoot, ".cao/scaffold.json"));
  } finally { prompts.close(); }
}

async function validate(projectRoot) {
  const manifest = await readManifest(projectRoot);
  const knownRoles = new Set(ROLES.map((role) => role.id));
  if (new Set(manifest.selectedRoles).size !== manifest.selectedRoles.length) throw new Error("manifest 里有重复角色。");
  for (const role of manifest.selectedRoles) {
    if (!knownRoles.has(role)) throw new Error("manifest 里有未知角色：" + role);
    if (!/^[A-Za-z0-9_-]+$/.test(manifest.providers[role] ?? "")) throw new Error("provider ID 无效：" + role);
  }
  if (!manifest.selectedRoles.includes("code_supervisor") || !manifest.selectedRoles.includes("developer")) {
    throw new Error("manifest 缺少完整运行时必需的 code_supervisor 或 developer。");
  }
  const states = await verifyManifestFiles(projectRoot, manifest);
  let failed = false;
  for (const item of states) {
    console.log(item.state.toUpperCase() + " " + item.path);
    if (item.state === "missing") failed = true;
  }
  if (failed) throw new Error("缺少脚手架生成文件。");
  for (const role of manifest.selectedRoles) {
    if (!manifest.providers[role]) throw new Error("缺少 provider 配置：" + role);
    const prompt = path.join(projectRoot, ".cao/project-prompts", role + ".md");
    try { await access(prompt); } catch { throw new Error("缺少项目提示词：" + prompt); }
  }
  for (const role of manifest.selectedRoles) runCao(projectRoot, ["profile", "validate", path.join(".cao/agent-store", role + ".md")]);
  runCao(projectRoot, ["workflow", "validate", ".cao/workflows/agent_review.py"]);
  console.log("CAO profile 和 workflow 校验通过。");
}

async function runtime(projectRoot, command, args) {
  if (command === "install") {
    const prompts = new Prompts();
    try {
    const manifest = await readManifest(projectRoot);
    const workflowPath = ".cao/workflows/agent_review.py";
    const workflowSource = await readFile(path.join(projectRoot, workflowPath), "utf8");
    const workflows = JSON.parse(captureCao(projectRoot, ["workflow", "list", "--json"]));
    const exists = workflows.some((workflow) => workflow.name === WORKFLOW_NAME);
    let updated;
    if (!exists) {
      const result = JSON.parse(captureCao(projectRoot, ["workflow", "create", WORKFLOW_NAME, "--from-file", workflowPath, "--json"]));
      updated = result.content_hash;
    } else {
      const current = JSON.parse(captureCao(projectRoot, ["workflow", "get", WORKFLOW_NAME, "--json"]));
      if (!current.content_hash) throw new Error(`CAO 没返回 ${WORKFLOW_NAME} 当前版本的内容指纹；为保护现有 workflow，已停止更新。`);
      if (current.source === workflowSource) {
        updated = current.content_hash;
      } else if (manifest.installedWorkflowHash && current.content_hash === manifest.installedWorkflowHash) {
        const result = JSON.parse(captureCao(projectRoot, ["workflow", "update", WORKFLOW_NAME, "--from-file", workflowPath, "--expected-hash", current.content_hash, "--json"]));
        updated = result.content_hash;
      } else {
        const replace = await prompts.confirm(`CAO 已有名为 ${WORKFLOW_NAME} 的 workflow，内容和脚手架模板不同。要备份当前版本并替换吗？`, { defaultValue: false });
        if (!replace) { console.log("已保留现有 workflow。需要并存时，请先在 CAO 中改名。"); return; }
        const result = JSON.parse(captureCao(projectRoot, ["workflow", "update", WORKFLOW_NAME, "--from-file", workflowPath, "--expected-hash", current.content_hash, "--json"]));
        updated = result.content_hash;
      }
    }
    if (!updated) throw new Error("CAO 没返回已安装 workflow 的内容指纹，manifest 未更新。");
    manifest.workflowName = WORKFLOW_NAME;
    manifest.installedWorkflowHash = updated;
    await writeManifest(projectRoot, manifest);
    console.log(`已安装 ${WORKFLOW_NAME}。`);
    } finally { prompts.close(); }
    return;
  }
  if (command === "run") {
    let task = "";
    const index = args.indexOf("--task");
    if (index >= 0) task = args[index + 1] ?? "";
    if (!task) {
      const prompt = new Prompts();
      try { task = await prompt.text("要交给 supervisor 的任务"); } finally { prompt.close(); }
    }
    const approvedPlanIndex = args.indexOf("--approved-plan");
    const approvedPlan = approvedPlanIndex >= 0 ? (args[approvedPlanIndex + 1] ?? "") : "";
    if (!task.trim()) throw new Error("任务不能为空。");
    const prompt = new Prompts();
    let approved;
    try { approved = await prompt.confirm("确认启动工作流？\n项目：" + projectRoot + "\n任务：" + task); }
    finally { prompt.close(); }
    if (!approved) { console.log("已取消。"); return; }
    const manifest = await readManifest(projectRoot);
    const caoArgs = ["workflow", "run", manifest.workflowName ?? WORKFLOW_NAME, "--working-directory", projectRoot, "--input", "task=" + task];
    if (approvedPlan) caoArgs.push("--input", "approved_plan=" + approvedPlan);
    runCao(projectRoot, caoArgs);
    return;
  }
  const runId = args.find((arg) => !arg.startsWith("--") && path.resolve(arg) !== projectRoot);
  const caoCommand = { status: "status", result: "result", cancel: "cancel", resume: "resume" }[command];
  if (!caoCommand) throw new Error("未知运行时命令：" + command);
  runCao(projectRoot, ["workflow", caoCommand, ...(runId ? [runId] : [])]);
}

export async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  if (!command || command === "--help" || command === "help") { console.log(usage); return; }
  if (command === "init" || command === "update") return init(await projectArg(args), command === "update");
  if (command === "workflow") {
    const [subcommand, ...rest] = args;
    return runtime(await projectArg(rest), subcommand, rest);
  }
  const projectRoot = await projectArg(args);
  if (command === "validate") return validate(projectRoot);
  if (["run", "status", "result", "cancel", "resume"].includes(command)) return runtime(projectRoot, command, args);
  throw new Error("未知命令：" + command + "\n" + usage);
}
