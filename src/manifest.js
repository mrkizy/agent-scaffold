import { createHash } from "node:crypto";

export const MANIFEST_PATH = ".cao/scaffold.json";

export function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function createManifest({ selectedRoles, providers, models = {}, providerSettings = {}, generatedFiles, updateFrom }) {
  return {
    schemaVersion: 1,
    scaffoldVersion: "0.1.0",
    createdAt: new Date().toISOString(),
    selectedRoles,
    providers,
    models,
    providerSettings,
    workflowName: updateFrom?.workflowName ?? "agent_scaffold_review",
    installedWorkflowHash: updateFrom?.installedWorkflowHash ?? null,
    generatedFiles: Object.fromEntries(
      Object.entries(generatedFiles).map(([path, content]) => [path, hashContent(content)]),
    ),
  };
}
