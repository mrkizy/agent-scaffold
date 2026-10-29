# CAO Agent Scaffold

[简体中文](README.zh-CN.md)

A project-scoped scaffolder for local CAO multi-agent teams. It generates role profiles, provider and model settings, project-specific prompts, and resumable development and review workflows inside each project's `.cao/` directory.

The goal is to avoid rebuilding the same supervisor, developer, and reviewer setup for every project—and to keep agent responsibilities and model choices consistent. One interactive command creates editable, validatable CAO configuration for the current project.

This is a community project, not an official CAO, Anthropic, Cursor, or OpenAI product. It does not include models or bypass the authentication and permissions of any provider.

### Features

- **Interactive setup:** Navigate with the arrow keys, select roles with Space, and confirm with Enter.
- **Role templates:** Code supervisor, architect, planner, developer, code reviewer, UI design reviewer, and functional reviewer. The supervisor and developer are required for the complete development workflow; other roles are optional.
- **Per-role provider and model settings:** Supports Claude Code, Cursor CLI, Codex, and custom CAO provider and model IDs. Configure Codex reasoning effort and Claude Code effort where available.
- **Project-specific instructions:** Keep reusable responsibilities in profile templates and project context and acceptance criteria in `.cao/project-prompts/`.
- **Development and review orchestration:** The supervisor assesses the task, risk, and acceptance criteria, and can call an architect or planner. After implementation, selected reviewers inspect the change; the supervisor screens findings and sends actionable items back to the developer.
- **A bounded review loop:** Run up to three review rounds. Only evidence-backed blocking or important findings introduced by the current change go to the developer. If issues remain after round three, automatic fixes stop and the workflow requests a plan reassessment.
- **Safe updates:** A manifest tracks generated file fingerprints. Updates preserve files changed by the project and create backups before overwriting. Workflow installation checks for name conflicts before replacing an existing workflow.
- **Run history and recovery:** CAO manages workflow status, results, cancellation, and resumption. The CLI asks for confirmation before starting a task.

### Design inspiration

The review workflow takes inspiration from Anthropic's engineering post [“How the Claude Code team does code review”](https://claude.dev/blog/solving-code-review-at-anthropic/). It adapts the public process ideas of finding real issues while preserving reviewer attention; requiring evidence and severity for findings; distinguishing newly introduced problems from pre-existing ones; and making review and repair converge with a round limit and no repeated findings.

This project translates those ideas into a multi-role workflow for local CAO projects: reviewers are read-only, the supervisor screens findings, only evidence-backed blocking or important issues are sent for fixes, and automatic rework stops after three rounds. It does not implement the article's voting system, Anthropic's internal evaluations, CI security gates, or release process, and it does not reuse Anthropic's internal code. The templates and orchestration here are this project's own implementation. People remain responsible for reviewing and accepting agent output.

### Requirements

- macOS or Linux terminal
- Node.js 20 or later
- CAO CLI, `cao-server`, and the provider CLIs you plan to use, installed and configured separately
- A model supported by the selected provider

The scaffolder uses only Node.js built-in modules. It does not install CAO or provider CLIs.

### Install the command

```sh
git clone https://github.com/mrkizy/agent-scaffold.git
cd agent-scaffold
npm link
```

`npm link` makes the `agent-scaffold` command available from any project directory on this machine. To remove the command, run `npm unlink` from this repository.

### Initialize a project

Go to the project you want to configure:

```sh
cd /path/to/your-project
agent-scaffold init
```

The interactive menu asks you to choose roles, providers, models, and available reasoning settings. Suggested defaults:

| Role/provider | Suggested default |
| --- | --- |
| developer | Cursor CLI |
| Other roles | Claude Code |
| Cursor CLI | `grok-4.7` |
| Codex | `gpt-6-luna`, medium reasoning effort |

These are suggestions only. Choose a model supported by your provider or use the provider's default model.

Initialization creates files in the project's `.cao/` directory:

```text
.cao/
├── agent-store/          # CAO profiles
├── project-prompts/      # Project-specific prompts and review standards
├── workflows/            # Editable workflow source
├── scaffold.json         # Role settings and generated-file fingerprints
├── start-server.sh       # Starts CAO server with this project's .cao config
└── launch-supervisor.sh  # Starts code_supervisor, when selected
```

Each profile asks the agent to read the root `AGENTS.md` first, or `CLAUDE.md` if `AGENTS.md` is absent, followed by `.cao/project-prompts/<role>.md`. Add project-specific architecture, terminology, constraints, and acceptance criteria to those prompt files.

### Validate, start CAO, and install the workflow

Start the project's CAO server in one terminal:

```sh
sh .cao/start-server.sh
```

Then, in another terminal in the project directory, run:

```sh
agent-scaffold validate
agent-scaffold workflow install
```

`validate` checks generated files, CAO profiles, and the workflow. `workflow install` registers the workflow as `agent_scaffold_review`. If CAO already has a workflow with that name but different contents, the command asks before replacing it. CAO keeps a backup of the previous version. Future updates replace the installed workflow automatically only while its fingerprint still matches the version recorded in the manifest.

### Dispatch a task and manage runs

```sh
agent-scaffold run --task "Add login error messages and review them against project standards"
```

Before starting, the CLI shows the project and task and asks for confirmation. A high-risk task may require plan approval; pass the approved plan with `--approved-plan` when you rerun it. CAO stores workflow runs, which you can manage with:

```sh
agent-scaffold status
agent-scaffold result <run-id>
agent-scaffold cancel <run-id>
agent-scaffold resume <run-id>
```

Do not put secrets or other sensitive information in task descriptions: agent output is stored in CAO workflow results and audit records.

### Update project templates

```sh
agent-scaffold update
```

The scaffolder compares file fingerprints in `.cao/scaffold.json`. It can update generated files that have not been edited; project-edited files are preserved by default. It creates timestamped backups before confirmed overwrites. We recommend tracking `.cao/` in version control before updating templates.

### Local development

```sh
npm run check
```

This command checks JavaScript syntax only. Validating CAO profiles and workflows requires the project's CAO server to be running:

```sh
agent-scaffold validate
```

### Current limitations

- The scaffolder generates configuration and workflows; it does not install CAO, provider CLIs, or models.
- The workflow orchestrates roles but does not replace CI, automated tests, security review, or human judgment.
- The developer step may write project files; read-only roles are dispatched as read-only steps. The user confirms before a workflow starts.
- The supervisor uses CAO's `discovery` capability to find workers in the same group. CAO 2.5.4 profile validation may show an advisory warning for this capability.
