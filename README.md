# CAO Agent Scaffold

[简体中文](#中文) | [English](#english)

## 中文

一个给本机开发项目用的 CAO 多 agent 脚手架。它把角色 profile、provider 和模型配置、项目专属提示词，以及可恢复的开发与审查工作流放进项目自己的 `.cao/` 目录。

它解决的问题很直接：在不同项目里重复配置主管、开发者和 reviewer 很费劲；不同 agent 的职责和模型也容易配乱。用一条统一命令，就能为当前项目生成一套可编辑、可校验、能运行的角色配置。

本项目是社区脚手架，不是 CAO、Anthropic、Cursor 或 OpenAI 的官方产品。它不包含模型，也不会绕过各 provider 自己的登录和权限机制。

## 提供什么

- **交互式项目初始化**：用方向键移动、Space 勾选、Enter 确认角色；无需手动输入角色名。
- **角色模板**：代码主管、架构师、规划师、开发者、代码审查员、UI 设计审查员、功能审查员。主管和开发者是完整开发工作流的必选角色，其余角色按项目需要创建。
- **逐角色配置 provider 和模型**：支持 Claude Code、Cursor CLI、Codex，也支持输入自定义 CAO provider ID 和模型 ID。可配置 Codex 推理强度及 Claude Code effort。
- **项目级约定**：通用职责放在 profile 模板，项目背景和验收要求放入 `.cao/project-prompts/`，避免把某个项目的规则带进其他项目。
- **审查与返修编排**：主管先判断任务、风险和验收条件，可选调用架构师或规划师；开发者实现后，由所选 reviewer 检查，主管筛选问题，再让开发者修复。
- **有上限的审查循环**：最多三轮审查。只把有证据、由本次改动引入的 blocking 或 important finding 交给开发者。第三轮后仍有开放问题时，停止自动返工并要求复核方案。
- **安全更新**：manifest 记录脚手架文件指纹。更新时保留项目手动改过的文件；覆盖前会备份。注册 workflow 时也会检查同名配置，避免静默覆盖。
- **运行记录和恢复**：运行状态、结果、取消和恢复交给 CAO workflow 管理；启动任务前会要求用户确认。

## 设计参考

审查流程参考了 Anthropic 工程团队分享的[《How the Claude Code team does code review》](https://claude.dev/blog/solving-code-review-at-anthropic/)。我们借鉴的是其中公开的流程思路：审查要找真实问题并节省人的注意力；finding 要有证据、标明严重程度，并区分本次引入的问题和既有问题；review 与修复要能收敛，设轮数上限，重复问题不应让 agent 无限返工。

脚手架把这些思路改写成适合本机 CAO 项目的多角色工作流：reviewer 只读审查，主管再筛选 finding；只修有证据的 blocking/important 项；三轮后停止自动返工并输出方案复核。这里没有实现文章中提到的投票系统、Anthropic 内部评测、CI 安全门禁或发布流程，也没有复用 Anthropic 内部代码。所有实现都由本项目模板生成，agent 结果仍需要人来判断和负责。

## 环境要求

- macOS 或 Linux 终端
- Node.js 20 或更高版本
- 已安装并配置好的 CAO CLI、`cao-server` 和所需 provider CLI
- 你选择的模型需要能被对应 provider 使用

脚手架只依赖 Node.js 内置模块；CAO 和 provider 不会随本项目安装。

## 安装命令

```sh
git clone https://github.com/mrkizy/agent-scaffold.git
cd agent-scaffold
npm link
```

`npm link` 会把 `agent-scaffold` 命令链接到本机。之后可从任意项目目录运行它。想移除命令时，在仓库目录执行 `npm unlink`。

## 初始化项目

进入要配置的项目目录：

```sh
cd /path/to/your-project
agent-scaffold init
```

菜单会逐个询问角色、provider、模型和可用的推理强度。默认建议值如下：

| 角色/provider | 默认建议 |
| --- | --- |
| developer | Cursor CLI |
| 其他角色 | Claude Code |
| Cursor CLI | `grok-4.7` |
| Codex | `gpt-6-luna`，推理强度 medium |

这些只是初始建议，可以在菜单里改成 provider 支持的值，也可以沿用 provider 默认模型。

初始化会在项目内生成：

```text
.cao/
├── agent-store/          # CAO profiles
├── project-prompts/      # 项目特有提示词和审查标准
├── workflows/            # 可编辑的 workflow 源文件
├── scaffold.json         # 角色配置与生成文件指纹
├── start-server.sh       # 用当前项目的 .cao 配置启动 CAO server
└── launch-supervisor.sh  # 启动 code_supervisor（选择该角色时生成）
```

profile 会要求 agent 先读项目根目录的 `AGENTS.md`；没有时再读 `CLAUDE.md`，随后读对应的 `.cao/project-prompts/<role>.md`。请把项目专属架构、术语、约束和验收规则补进这些提示词文件。

## 校验、启动和安装工作流

在一个终端启动项目 CAO server：

```sh
sh .cao/start-server.sh
```

再开一个终端，在项目目录执行：

```sh
agent-scaffold validate
agent-scaffold workflow install
```

`validate` 会检查生成文件、CAO profiles 和 workflow。`workflow install` 会把工作流注册为 `agent_scaffold_review`。若 CAO 里已有同名但内容不同的工作流，命令会先询问；确认替换时，CAO 会保留旧版本。后续更新只会自动替换 manifest 中指纹仍匹配的版本。

## 派发任务和管理运行

```sh
agent-scaffold run --task "实现登录页错误提示，并按项目规范审查"
```

启动前会展示项目和任务并要求确认。高风险任务可能需要先审核方案，再用 `--approved-plan` 重新运行。CAO workflow 会保存运行记录，可用以下命令管理：

```sh
agent-scaffold status
agent-scaffold result <run-id>
agent-scaffold cancel <run-id>
agent-scaffold resume <run-id>
```

不要在任务描述中放密钥或其他敏感信息：agent 输出会进入 CAO workflow 的运行结果和审计记录。

## 更新项目模板

```sh
agent-scaffold update
```

脚手架会比较 `.cao/scaffold.json` 里的文件指纹。未手动修改的生成文件可以更新；项目手动修改过的文件默认保留。确认覆盖前会创建带时间戳的备份。建议先把 `.cao/` 纳入版本控制，再更新模板。

## 本地开发

```sh
npm run check
```

这个命令只做 JavaScript 语法检查。CAO profile/workflow 校验需要本机 CAO server 正在运行：

```sh
agent-scaffold validate
```

## 当前边界

- 脚手架生成配置和工作流，不负责安装 CAO、provider CLI 或模型。
- workflow 负责编排角色，不替代 CI、自动化测试、安全审查或人的最终判断。
- 开发者步骤可能写入项目文件；只读角色步骤按只读方式调度。是否运行工作流由用户确认。
- supervisor 使用 CAO 的 `discovery` 能力查找同组 worker。CAO 2.5.4 的 profile 校验可能对此显示 advisory warning。

## English

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
