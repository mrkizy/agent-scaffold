# Agent Scaffold Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Node.js command that creates and maintains a project's selected CAO roles, provider assignments, generic role prompts, project-specific prompt documents, safe launch/configuration files, and a resumable review workflow.

**Architecture:** One locally maintained Node.js package provides interactive `init`, `validate`, `update`, `workflow install`, `run`, and `status` commands. Role and provider catalogs drive the menu and rendered CAO profiles; generic prompts stay in central templates while project rules live in editable `.cao/project-prompts/` documents. A manifest tracks generated files. The package also renders a deterministic CAO Python workflow that delegates role steps, journals findings, limits review to three rounds, and can resume safely.

**Tech Stack:** Node.js built-in readline and filesystem modules, Markdown templates, JSON manifest, installed CAO CLI.

---

## Schedule assumptions

- One developer, focused full-time workdays.
- Start Friday 2026-10-30; 20 engineering days plus two buffer days, with the complete version targeted for Thursday 2026-11-26 and final buffer ending Monday 2026-11-30.
- The runtime uses CAO's workflow engine rather than a separate task database. It runs only after the user confirms `agent-scaffold run`; it does not install or manage a machine-wide CAO server.

## Complete v1 scope

- A local `agent-scaffold` command installed once with `npm link`, usable from any project directory.
- Keyboard-driven interactive role/provider/model selection with `code_supervisor` selected by default; custom provider IDs and model IDs are accepted.
- Per-role model overrides and provider-specific reasoning settings are stored in CAO profiles: Codex `codexConfig.model_reasoning_effort`, Claude Code `claudeConfig.effort`.
- Generic templates for `code_supervisor`, `architect`, `planner`, `developer`, `code_reviewer`, `ui_design_reviewer`, and `functional_reviewer`.
- Supervisor routing generated from selected roles only. Architect handles cross-module/high-risk design; planner is used when implementation has dependencies or useful parallel work.
- Developer template includes the portable subset of `good-code`: read project instructions and nearby patterns, preserve a single source of truth, keep scope focused, handle errors explicitly, and report verification evidence.
- Reviewer templates use independent context where supported, stay read-only, and report evidence-backed findings with severity, location, impact, and whether the change introduced the issue. The supervisor protocol filters nits, avoids repeating closed findings, reviews the new diff after fixes, and requests a plan reassessment after three review/fix rounds.
- Editable role-specific prompt extensions and shared reviewer guidance under `.cao/project-prompts/`.
- Safe `init` generation with complete preview, skip-by-default conflict handling, and explicit backup-before-replace.
- `.cao/scaffold.json` manifest tracking scaffold version, selected roles/providers, generated paths, and file fingerprints.
- `validate` checks profile syntax, selected-role references, prompt-document links, provider IDs, and CAO profile validation where the installed CAO CLI supports it.
- `update` previews template changes, preserves edited project files by default, and offers three-way/backup-based replacement when the user chooses it.
- A generated CAO workflow starts with supervisor triage, conditionally calls architect/planner, dispatches developer, runs only selected reviewers, filters and deduplicates findings, and sends actionable findings back to developer.
- The workflow tracks at most three review rounds. It re-reviews the changed diff, does not reopen closed findings, and after round three returns a plan-reassessment result for user decision instead of continuing indefinitely.
- Developer mutation steps use CAO `recovery="manual"`; read-only review steps use an explicitly declared safe recovery policy. The workflow uses stable step IDs and avoids nondeterministic top-level values so CAO can resume it.
- `run` asks before starting and launches the named CAO workflow with the current project as working directory. `status` and `result` expose CAO's persisted run state and output.
- Workflow inputs contain task text and project-relative paths only; secrets are never sent as journaled inputs.
- Optional project `launch-supervisor.sh` generation when a supervisor is selected. It launches the selected supervisor profile in the project context; it does not install or manage a machine-wide CAO server or login item.
- README covers local installation, init, launch, validate, update, provider limitations, and file conflict behavior.

## Planned package structure

- `package.json`: package metadata, dependencies, and command registration.
- `bin/agent-scaffold.js`: executable entry point and user-facing error handling.
- `src/commands/init.js`: role/provider menu and first-time generation flow.
- `src/commands/validate.js`: manifest, profile, provider, and prompt-reference checks.
- `src/commands/update.js`: template comparison and safe update flow.
- `src/commands/workflow.js`: register the generated workflow and expose run/status/result commands through the CAO CLI.
- `src/catalog/roles.js`: role metadata, descriptions, defaults, and routing rules.
- `src/catalog/providers.js`: known CAO provider IDs and custom-provider handling.
- `src/render/profile.js`: CAO frontmatter and role prompt rendering.
- `src/render/project-prompts.js`: editable project extension documents.
- `src/fs/plan-generation.js`: output plan, collisions, and diff preview.
- `src/fs/apply-generation.js`: safe writes and timestamped backups.
- `src/manifest.js`: read/write and fingerprint generated files.
- `templates/workflows/review_pipeline.py`: deterministic CAO workflow template with stable step IDs, structured findings, recovery declarations, and a three-round ceiling.
- `templates/roles/*.md`: generic role prompts.
- `templates/project-prompts/*.md`: project-specific prompt starters.
- `templates/launch-supervisor.sh`: optional project launch wrapper.
- `README.md`: installation and usage guide.

## Implementation schedule

### Friday 2026-10-30 — Package foundation

- [ ] Create the local Node package, `agent-scaffold` executable, and command dispatch.
- [ ] Resolve the target project from the current working directory and show it before writes.
- [ ] Add readable cancellation and failure messages.

**Milestone:** The command starts from any directory and identifies the intended project.

### Monday 2026-11-02 — Interactive catalog

- [ ] Add role descriptions, default selections, and optional supervisor selection.
- [ ] Add per-role provider choices and custom provider entry.
- [ ] Add conditional fields only for provider options CAO profiles can actually accept; show provider limitations instead of pretending every provider behaves the same.
- [ ] Show a summary of role-to-provider assignments before generation.

**Milestone:** Users can choose exactly which roles and providers to create.

### Tuesday 2026-11-03 — Generic architecture and planning profiles

- [ ] Write the generic `code_supervisor` prompt with intake, role routing, parallel/sequential dispatch, status tracking, and user escalation rules.
- [ ] Write `architect` and `planner` prompts with clear read-only boundaries and output formats.
- [ ] Render the supervisor's available-role list from the menu selection.

**Milestone:** Supervisor routing matches the selected role set and invokes design/planning only when useful.

### Wednesday 2026-11-04 — Developer and reviewer profiles

- [ ] Write the developer prompt with distilled cross-project `good-code` rules and implementation evidence requirements.
- [ ] Write code, UI, and functional reviewer prompts with independent read-only review expectations.
- [ ] Define the finding format: ID, severity, evidence/location, impact, introduced-by-change status, and disposition.
- [ ] Encode the review loop: no nits in repair loop, no repeats of closed findings, re-review the new diff, reassess the plan after three rounds.

**Milestone:** Every selected profile has a role-specific contract, and review findings can be tracked consistently.

### Thursday 2026-11-05 — Project prompt extensions

- [ ] Generate one editable extension document for each selected role.
- [ ] Generate shared reviewer guidance when a reviewer is selected.
- [ ] Add explicit profile instructions to read the matching project document.
- [ ] Document provider-specific prompt-loading limitations in generated developer guidance.

**Milestone:** Project-specific instructions can change without editing the reusable generic templates.

### Friday 2026-11-06 — Safe first-time generation

- [ ] Build a complete file plan before writing.
- [ ] Show every output path and existing-file conflict with a diff preview.
- [ ] Skip existing files by default; require a separate confirmation before backup-and-replace.
- [ ] Generate selected profile files, prompt documents, manifest, and optional launch wrapper.
- [ ] Ensure cancellation leaves the project untouched.

**Milestone:** `init` safely creates a usable project setup.

### Monday 2026-11-09 — Manifest and update workflow

- [ ] Record selected roles, provider IDs, scaffold version, paths, and fingerprints in `.cao/scaffold.json`.
- [ ] Compare generated files with prior fingerprints to identify project edits.
- [ ] Add `update` preview that distinguishes unchanged, template-changed, and user-edited files.
- [ ] Preserve project edits by default; create backups before explicit replacement.

**Milestone:** Projects can adopt new generic templates without silently losing local changes.

### Tuesday 2026-11-10 — Validation command

- [ ] Add `validate` checks for manifest consistency, missing project prompts, dangling supervisor role references, and invalid provider identifiers.
- [ ] Call `cao profile validate <path>` for generated profiles when CAO is installed.
- [ ] Report provider capability caveats as warnings, not false passes.

**Milestone:** Users can see whether generated configuration is internally consistent and accepted by CAO.

### Wednesday 2026-11-11 — Launch and project isolation

- [ ] Add optional `launch-supervisor.sh` generation for projects that selected `code_supervisor`.
- [ ] Keep project root, selected supervisor, and provider explicit in the generated command.
- [ ] Do not install, stop, or reconfigure the machine-wide CAO service.
- [ ] Document how project-local profiles relate to the user's existing CAO server setup.

**Milestone:** A generated project has a clear launch entry point without changing global CAO service settings.

### Thursday 2026-11-12 — End-to-end acceptance walkthrough

- [ ] Walk through creating a fresh project with all roles.
- [ ] Walk through creating a minimal project with only developer and code reviewer.
- [ ] Walk through custom provider entry, custom project prompts, existing-file conflicts, cancellation, update, and validation.
- [ ] Check generated CAO profiles and launch command in a temporary project.

**Milestone:** Full workflow works from first menu to CAO launch and later template update.

### Friday 2026-11-13 — Documentation and local installation

- [ ] Document one-time local installation with `npm link` and updates to the local package.
- [ ] Document `init`, `validate`, and `update` usage with expected prompts and outputs.
- [ ] Explain profile prompt loading and permission differences across providers.
- [ ] Explain that the three-round review policy is prompt-level in v1, not a hard execution limit.

**Milestone:** The user can install and use the scaffold without setup help.

### Monday 2026-11-16 — First-project pilot

- [ ] Run the full workflow against a temporary copy of one existing project.
- [ ] Review generated prompts and paths for unexpected project-specific assumptions.
- [ ] Fix issues found in launch, validation, and update flows.
- [ ] Confirm local edits survive a template update preview.

**Milestone:** The complete v1 is ready to reuse on another project.

### Tuesday 2026-11-17 — Runtime workflow contract

- [ ] Define workflow inputs, structured supervisor route output, reviewer finding schema, and run result schema.
- [ ] Define which profiles are selected from the manifest and what to do when an optional role is absent.
- [ ] Keep workflow step IDs stable across resume and derive them from task stage and review round.

**Milestone:** The generated workflow has a stable contract and can resume without changing step identity.

### Wednesday 2026-11-18 — Supervisor triage and routing

- [ ] Add a supervisor triage step that returns risk, acceptance criteria, and selected optional roles as structured output.
- [ ] Reject or remove role selections not present in the generated manifest.
- [ ] Add conditional architect and planner steps with read-only outputs.

**Milestone:** The workflow chooses only roles the user created.

### Thursday 2026-11-19 — Developer and reviewer steps

- [ ] Add the initial developer step and pass its implementation summary and verification evidence forward.
- [ ] Add selected code, UI, and functional reviewer steps.
- [ ] Keep UI and functional review sequential when the project guidance says they can interfere with one another.
- [ ] Require finding output with severity, evidence, file or reproduction location, impact, and introduced-by-change status.

**Milestone:** A workflow run can implement and return review results as structured data.

### Friday 2026-11-20 — Finding screening and repair

- [ ] Add a supervisor screening step to deduplicate findings and reject unsupported or pre-existing reports.
- [ ] Filter `nit` findings out of the repair loop.
- [ ] Send all active findings to developer together and ask it to fix every occurrence of each bug class.

**Milestone:** Only actionable, evidenced findings trigger a repair.

### Monday 2026-11-23 — Bounded review loop

- [ ] Implement a maximum of three reviewer rounds with deterministic control flow.
- [ ] After each repair, review the changed diff and existing open findings without repeating closed findings.
- [ ] After the third unresolved round, call architect or supervisor to reassess the approach and return `needs_user_decision`.

**Milestone:** The workflow converges or stops with a clear escalation result; it never loops indefinitely.

### Tuesday 2026-11-24 — Resume and recovery

- [ ] Declare `manual` recovery for developer steps that can modify project files.
- [ ] Declare `idempotent` recovery for read-only analysis/review steps only.
- [ ] Preserve stable step IDs and deterministic script execution for CAO resume.
- [ ] Surface CAO decision-required halts instead of swallowing them as ordinary failures.

**Milestone:** Interrupted workflows can be inspected and resumed without silently repeating code-writing work.

### Wednesday 2026-11-25 — Workflow registration and runtime commands

- [ ] Add `workflow install` using `cao workflow create` under the project's `CAO_HOME_DIR`.
- [ ] Add `run` with a confirmation prompt, working directory, task input, and CAO's persisted run ID.
- [ ] Add `status` and `result` wrappers; do not auto-run a workflow during `init` or `update`.
- [ ] Keep large result details in CAO output or file references rather than duplicating them in the Node process.

**Milestone:** Users can install, explicitly start, inspect, and retrieve a workflow run from the local command.

### Thursday 2026-11-26 — Workflow validation and full handoff

- [ ] Validate the generated Python workflow with `cao workflow validate` under the project's CAO home.
- [ ] Validate generated profiles with the installed CAO profile validator.
- [ ] Review recovery policies, step IDs, secret handling, reviewer filtering, and the three-round stop condition.
- [ ] Update README with start, status, result, cancel, and resume commands and the approval gate.

**Milestone:** The full scaffolder and runtime workflow are ready for user-approved runs.

### Friday 2026-11-27 and Monday 2026-11-30 — Schedule buffer

- [ ] Resolve provider-specific or CAO schema issues found in the pilot.
- [ ] Confirm the final install and recovery instructions.
- [ ] Record any remaining CAO workflow limitations separately from the shipped scope.

**Milestone:** Full v1 accepted with documented limits.

## Self-review

- First-time setup, role/provider choice, templates, project overlays, safe writes, update, validation, launch, CAO workflow registration, run/status/result, and docs all have explicit schedule entries.
- The workflow is user-confirmed before execution and uses CAO's journal instead of a parallel task database.
- Developer re-execution is not silently authorized; review rounds are finite and unresolved findings return to the user.
- The schedule has 20 engineering days and two buffer days; the complete version is targeted for 2026-11-26.
