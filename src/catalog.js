export const PROVIDERS = [
  { id: "claude_code", label: "Claude Code 命令行" },
  { id: "cursor_cli", label: "Cursor 命令行" },
  { id: "codex", label: "Codex" },
];

export const ROLES = [
  {
    id: "code_supervisor",
    label: "代码主管",
    description: "拆任务、调度角色、跟进审查并汇总交付。",
    defaultSelected: true,
    kind: "supervisor",
  },
  {
    id: "architect",
    label: "架构师",
    description: "设计跨模块和高风险改动，只读分析。",
    kind: "worker",
  },
  {
    id: "planner",
    label: "规划师",
    description: "把方案拆成可验证任务，只读规划。",
    kind: "worker",
  },
  {
    id: "developer",
    label: "开发者",
    description: "实现分配的改动并汇报验证证据。",
    kind: "developer",
  },
  {
    id: "code_reviewer",
    label: "代码审查员",
    description: "检查正确性、安全和回归风险。",
    kind: "reviewer",
  },
  {
    id: "ui_design_reviewer",
    label: "UI 设计审查员",
    description: "按设计依据检查视觉和交互要求。",
    kind: "reviewer",
  },
  {
    id: "functional_reviewer",
    label: "功能审查员",
    description: "按验收条件检查功能行为和数据规则。",
    kind: "reviewer",
  },
];

export const REVIEWER_ROLES = ROLES.filter((role) => role.kind === "reviewer");
