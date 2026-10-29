# CAO Agent Scaffold

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
