import json

from cao_workflow import emit_output, get_inputs, step

INPUTS = {
    "task": {"type": "string", "required": True},
    "approved_plan": {"type": "string", "required": False, "default": ""},
}

CONFIG = json.loads({{CONFIG_JSON}})
MAX_REVIEW_ROUNDS = 3


def run_readonly(profile, prompt, step_id):
    return step(
        CONFIG["providers"][profile],
        profile,
        prompt,
        recovery="idempotent",
        step_id=step_id,
    )


def run_developer(prompt, step_id):
    return step(
        CONFIG["providers"]["developer"],
        "developer",
        prompt,
        recovery="manual",
        step_id=step_id,
    )


def output_text(handle):
    value = handle.output
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)


def parse_json(text):
    candidate = text.strip()
    if candidate.startswith("```"):
        lines = candidate.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        candidate = "\n".join(lines).strip()
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start < 0 or end < start:
        raise ValueError("agent did not return a JSON object")
    return json.loads(candidate[start : end + 1])


def result(state, **fields):
    payload = {"state": state}
    payload.update(fields)
    emit_output(payload)


def fail_closed(stage, raw_output, reason):
    result(
        "needs_user_decision",
        stage=stage,
        reason=reason,
        raw_output=raw_output,
        message="工作流无法安全解析 agent 结果，未继续派发写入或宣称通过。",
    )


def ask_supervisor(profile, task, instruction, step_id):
    prompt = "\n\n".join(
        [
            "你是项目 code_supervisor。只分析和协调，不直接改代码；本流程会负责调用角色，不要调用 assign 或 handoff。",
            "先读项目 AGENTS.md 和 .cao/project-prompts/code_supervisor.md。",
            "任务：\n" + task,
            instruction,
            "只返回一个 JSON 对象，不要 Markdown 代码围栏。",
        ]
    )
    handle = run_readonly(profile, prompt, step_id)
    raw = output_text(handle)
    return raw, parse_json(raw)


def finding_key(finding):
    return str(finding.get("id", "")).strip()


def valid_actionable_findings(payload, closed_ids):
    findings = payload.get("actionable_findings")
    if not isinstance(findings, list):
        raise ValueError("supervisor result must include actionable_findings array")
    accepted = []
    seen = set()
    for finding in findings:
        if not isinstance(finding, dict):
            continue
        severity = finding.get("severity")
        if severity not in ("blocking", "important"):
            continue
        finding_id = finding_key(finding)
        if not finding_id or not finding.get("evidence"):
            raise ValueError("actionable finding needs a stable id and evidence")
        if finding.get("introduced_by_change") is not True:
            continue
        if finding_id in closed_ids or finding_id in seen:
            continue
        seen.add(finding_id)
        accepted.append(finding)
    return accepted


def main():
    inputs = get_inputs()
    task = inputs["task"].strip()
    if not task:
        result("needs_user_decision", stage="input", reason="task is empty")
        return

    supervisor = "code_supervisor"
    selected = set(CONFIG["selected_roles"])
    available_reviewers = [role for role in CONFIG["reviewers"] if role in selected]
    available_optional_roles = [role for role in ("architect", "planner") if role in selected]
    route_instruction = (
        "判断任务是否需要实现。输出 JSON："
        "{\"mode\":\"implementation\"|\"answer\",\"risk\":\"low\"|\"medium\"|\"high\","
        "\"acceptance_criteria\":[...],\"use_architect\":true|false,\"use_planner\":true|false,"
        "\"reviewers\":[role ids],\"requires_user_decision\":true|false,\"decision_reason\":\"...\","
        "\"answer\":\"...\"}。reviewers 只能从以下已创建的 reviewer 中选择："
        + json.dumps(available_reviewers, ensure_ascii=False)
        + "。architect/planner 只能从以下已创建角色中选择："
        + json.dumps(available_optional_roles, ensure_ascii=False)
        + "；未创建的角色对应字段必须为 false。"
    )
    try:
        raw_route, route = ask_supervisor(
            supervisor,
            task,
            route_instruction,
            "supervisor:triage",
        )
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        fail_closed("supervisor:triage", "", str(error))
        return
    if route.get("mode") == "answer":
        result("answered_without_changes", answer=route.get("answer", ""))
        return
    if route.get("mode") != "implementation":
        fail_closed("supervisor:triage", raw_route, "invalid mode")
        return
    if route.get("risk") not in ("low", "medium", "high"):
        fail_closed("supervisor:triage", raw_route, "risk must be low, medium, or high")
        return
    if not isinstance(route.get("requires_user_decision", False), bool):
        fail_closed("supervisor:triage", raw_route, "requires_user_decision must be a boolean")
        return

    criteria = route.get("acceptance_criteria", [])
    if not isinstance(criteria, list) or not criteria:
        fail_closed("supervisor:triage", raw_route, "acceptance criteria are missing")
        return

    requested_reviewers = route.get("reviewers", [])
    if not isinstance(requested_reviewers, list):
        fail_closed("supervisor:triage", raw_route, "reviewers must be an array")
        return
    reviewers = [role for role in requested_reviewers if role in available_reviewers]
    if not reviewers:
        reviewers = available_reviewers

    approved_plan = inputs.get("approved_plan", "").strip()
    architecture = ""
    plan = ""
    if route.get("use_architect") and "architect" in selected:
        prompt = "\n\n".join(
            [
                "先读项目 AGENTS.md 和 .cao/project-prompts/architect.md。只读分析，不改文件。",
                "任务：\n" + task,
                "验收条件：\n" + json.dumps(criteria, ensure_ascii=False),
                "给出推荐方案、模块边界、风险和待用户决定的问题。",
            ]
        )
        architecture = output_text(run_readonly("architect", prompt, "architect:design"))
        if (route.get("risk") == "high" or route.get("requires_user_decision")) and not approved_plan:
            result(
                "needs_user_approval",
                risk=route.get("risk"),
                reason=route.get("decision_reason", "high-risk design needs approval"),
                architecture=architecture,
                acceptance_criteria=criteria,
                message="先审核方案，再用 approved_plan 输入重新运行工作流。",
            )
            return
    elif (route.get("requires_user_decision") or route.get("risk") == "high") and not approved_plan:
        result(
            "needs_user_decision",
            reason=route.get("decision_reason", "high-risk task needs a reviewed plan"),
            acceptance_criteria=criteria,
        )
        return

    if approved_plan:
        architecture = approved_plan

    if route.get("use_planner") and "planner" in selected:
        prompt = "\n\n".join(
            [
                "先读项目 AGENTS.md 和 .cao/project-prompts/planner.md。只读规划，不改文件。",
                "任务：\n" + task,
                "已确认方案：\n" + (architecture or "无独立架构方案；按现有结构实现。"),
                "验收条件：\n" + json.dumps(criteria, ensure_ascii=False),
                "拆成带依赖、文件范围和验收方式的任务。输出简洁 Markdown。",
            ]
        )
        plan = output_text(run_readonly("planner", prompt, "planner:plan"))

    developer_prompt = "\n\n".join(
        [
            "先读项目 AGENTS.md 和 .cao/project-prompts/developer.md。按验收条件实现，不要改范围外文件。",
            "任务：\n" + task,
            "验收条件：\n" + json.dumps(criteria, ensure_ascii=False),
            "架构方案：\n" + (architecture or "无；沿用项目现有结构。"),
            "实施计划：\n" + (plan or "无；这是单一任务，直接实现。"),
            "完成后返回 JSON，字段为 summary、files_changed、verification、risks、unresolved。",
        ]
    )
    raw_implementation = output_text(
        run_developer(developer_prompt, "developer:initial")
    )

    history = []
    closed_ids = set()
    for round_number in range(1, MAX_REVIEW_ROUNDS + 1):
        round_findings = []
        for reviewer in reviewers:
            prompt = "\n\n".join(
                [
                    "先读项目 AGENTS.md、.cao/project-prompts/review-standards.md 和对应 reviewer 项目提示词。只读审查，不改文件。",
                    "任务：\n" + task,
                    "验收条件：\n" + json.dumps(criteria, ensure_ascii=False),
                    "本轮实现报告：\n" + raw_implementation,
                    "已关闭 finding ID（不得重复）：\n" + json.dumps(sorted(closed_ids)),
                    "只返回 JSON：{\"findings\":[{\"id\":\"...\",\"severity\":\"blocking|important|nit|pre_existing\",\"summary\":\"...\",\"evidence\":\"...\",\"location\":\"file:line or reproduction\",\"impact\":\"...\",\"introduced_by_change\":true|false}]}。没有问题时 findings=[]。",
                ]
            )
            raw_review = output_text(
                run_readonly(reviewer, prompt, "review:{}:{}".format(reviewer, round_number))
            )
            try:
                review_payload = parse_json(raw_review)
            except (ValueError, json.JSONDecodeError) as error:
                fail_closed("review:{}:{}".format(reviewer, round_number), raw_review, str(error))
                return
            findings = review_payload.get("findings")
            if not isinstance(findings, list):
                fail_closed("review:{}:{}".format(reviewer, round_number), raw_review, "findings must be an array")
                return
            round_findings.extend(
                finding for finding in findings if isinstance(finding, dict)
            )

        screening_prompt = "\n\n".join(
            [
                "你是 code_supervisor。核对 findings 是否由本次改动引入，去重并排除无证据猜测。不要扩大任务范围。",
                "任务：\n" + task,
                "验收条件：\n" + json.dumps(criteria, ensure_ascii=False),
                "本轮 reviewer findings：\n" + json.dumps(round_findings, ensure_ascii=False),
                "已关闭 ID：\n" + json.dumps(sorted(closed_ids)),
                "只返回 JSON：{\"actionable_findings\":[...],\"closed_findings\":[{\"id\":\"...\",\"status\":\"nit|pre_existing|rejected\",\"reason\":\"...\"}]}。actionable_findings 只含有证据的 blocking 或 important 项。",
            ]
        )
        try:
            raw_screen, screen = ask_supervisor(
                supervisor,
                task,
                screening_prompt,
                "supervisor:screen:{}".format(round_number),
            )
            actionable = valid_actionable_findings(screen, closed_ids)
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            fail_closed("supervisor:screen:{}".format(round_number), locals().get("raw_screen", ""), str(error))
            return

        closed_findings = screen.get("closed_findings", [])
        if not isinstance(closed_findings, list):
            fail_closed("supervisor:screen:{}".format(round_number), raw_screen, "closed_findings must be an array")
            return
        for closed in closed_findings:
            if isinstance(closed, dict) and closed.get("id"):
                closed_ids.add(str(closed["id"]))
        history.append({
            "round": round_number,
            "reviewers": reviewers,
            "actionable_findings": actionable,
            "closed_findings": closed_findings,
        })

        if not actionable:
            state = "reviewed" if reviewers else "implemented_unreviewed"
            result(
                state,
                task=task,
                risk=route.get("risk", "unknown"),
                acceptance_criteria=criteria,
                implementation=raw_implementation,
                review_history=history,
                closed_findings=sorted(closed_ids),
                message="没有开放的 blocking 或 important finding。",
            )
            return

        if round_number == MAX_REVIEW_ROUNDS:
            reassessor = "architect" if "architect" in selected else supervisor
            replan_prompt = "\n\n".join(
                [
                    "重新审视当前方案为何未能收敛。不要修改文件。",
                    "任务：\n" + task,
                    "验收条件：\n" + json.dumps(criteria, ensure_ascii=False),
                    "实现报告：\n" + raw_implementation,
                    "全部开放 finding：\n" + json.dumps(actionable, ensure_ascii=False),
                    "给出根因、替代方案和建议给用户决定的事项。",
                ]
            )
            reassessment = output_text(
                run_readonly(reassessor, replan_prompt, "reassess:after-round-3")
            )
            result(
                "needs_user_decision",
                task=task,
                risk=route.get("risk", "unknown"),
                open_findings=actionable,
                review_history=history,
                plan_reassessment=reassessment,
                message="三轮后仍有开放 finding，工作流已停止自动返工。",
            )
            return

        fix_prompt = "\n\n".join(
            [
                "先读项目 AGENTS.md 和 .cao/project-prompts/developer.md。只修下面的开放 finding 和同类实例，不扩大范围。",
                "任务：\n" + task,
                "验收条件：\n" + json.dumps(criteria, ensure_ascii=False),
                "开放 finding：\n" + json.dumps(actionable, ensure_ascii=False),
                "修复后返回 JSON，字段为 summary、files_changed、verification、risks、unresolved。",
            ]
        )
        raw_implementation = output_text(
            run_developer(
                fix_prompt,
                "developer:fix:{}".format(round_number),
            )
        )


main()
