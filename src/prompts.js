import { createInterface } from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
import { stdin, stdout } from "node:process";

export class Prompts {
  #readline = null;

  #input() {
    if (!this.#readline) this.#readline = createInterface({ input: stdin, output: stdout });
    return this.#readline;
  }

  async text(message, { defaultValue = "" } = {}) {
    const suffix = defaultValue ? " [" + defaultValue + "]" : "";
    const value = (await this.#input().question(message + suffix + ": ")).trim();
    return value || defaultValue;
  }

  async confirm(message, { defaultValue = false } = {}) {
    const hint = defaultValue ? "Y/n" : "y/N";
    const answer = (await this.#input().question(message + " (" + hint + "): ")).trim().toLowerCase();
    if (!answer) return defaultValue;
    return ["y", "yes", "是", "好"].includes(answer);
  }

  async #menu(message, choices, { multi = false, defaults = [] } = {}) {
    if (!stdin.isTTY || typeof stdin.setRawMode !== "function") return undefined;

    this.#readline?.close();
    this.#readline = null;
    const selected = new Set(defaults);
    let active = Math.max(0, choices.findIndex((choice) => selected.has(choice.id)));
    let firstDraw = true;
    const footer = multi
      ? "↑/↓ 移动  ← 取消选择  →/Space 选择  Enter 确认  Esc 取消"
      : "↑/↓ 或 ←/→ 移动  Enter 确认  Esc 取消";
    const rows = () => [
      message,
      ...choices.map((choice, index) => {
        const pointer = index === active ? "❯" : " ";
        const marker = multi ? (selected.has(choice.id) ? "[x]" : "[ ]") : (index === active ? "●" : "○");
        const detail = choice.description ? " — " + choice.description : "";
        return pointer + " " + marker + " " + choice.label + detail;
      }),
      footer,
    ];
    const render = () => {
      const output = rows();
      if (!firstDraw) stdout.write("\x1b[" + output.length + "A");
      for (const row of output) stdout.write("\r\x1b[2K" + row + "\n");
      firstDraw = false;
    };

    return new Promise((resolve) => {
      const finish = (value) => {
        stdin.off("keypress", onKeypress);
        stdin.setRawMode(false);
        stdout.write("\x1b[?25h\n");
        stdin.pause();
        resolve(value);
      };
      const onKeypress = (_character, key = {}) => {
        if (key.name === "up" || key.name === "left") {
          if (multi && key.name === "left") selected.delete(choices[active].id);
          else active = (active + choices.length - 1) % choices.length;
          render();
          return;
        }
        if (key.name === "down" || key.name === "right") {
          if (multi && key.name === "right") selected.add(choices[active].id);
          else active = (active + 1) % choices.length;
          render();
          return;
        }
        if (multi && (key.name === "space" || _character === " ")) {
          const id = choices[active].id;
          if (selected.has(id)) selected.delete(id);
          else selected.add(id);
          render();
          return;
        }
        if (key.name === "return" || key.name === "enter") {
          finish(multi ? choices.filter((choice) => selected.has(choice.id)).map((choice) => choice.id) : choices[active].id);
          return;
        }
        if (key.name === "escape" || (key.ctrl && key.name === "c")) finish(null);
      };

      stdout.write("\x1b[?25l");
      emitKeypressEvents(stdin);
      stdin.setRawMode(true);
      stdin.resume();
      stdin.on("keypress", onKeypress);
      render();
    });
  }

  async chooseOne(message, choices, { defaultValue } = {}) {
    const activeChoices = defaultValue && choices.some((choice) => choice.id === defaultValue)
      ? [...choices]
      : choices;
    const answer = await this.#menu(message, activeChoices, { defaults: defaultValue ? [defaultValue] : [] });
    if (answer !== undefined) return answer;

    stdout.write("\n" + message + "\n");
    activeChoices.forEach((choice, index) => stdout.write("  " + (index + 1) + ". " + choice.label + (choice.description ? " — " + choice.description : "") + "\n"));
    const raw = (await this.#input().question("输入编号：")).trim();
    const index = Number(raw) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= activeChoices.length) throw new Error("选择无效。");
    return activeChoices[index].id;
  }

  async chooseMany(message, choices, { defaults = [] } = {}) {
    const answer = await this.#menu(message, choices, { multi: true, defaults });
    if (answer !== undefined) return answer;

    stdout.write("\n" + message + "\n");
    choices.forEach((choice, index) => {
      const selected = defaults.includes(choice.id) ? "x" : " ";
      stdout.write("  " + (index + 1) + ". [" + selected + "] " + choice.label + (choice.description ? " — " + choice.description : "") + "\n");
    });
    stdout.write("输入编号，用逗号分隔；输入 0 表示不选；直接回车保留默认选择。\n");
    const raw = (await this.#input().question("> ")).trim();
    if (!raw) return [...defaults];
    if (raw === "0") return [];
    const indexes = raw.split(",").map((part) => Number(part.trim()));
    if (indexes.some((index) => !Number.isInteger(index) || index < 1 || index > choices.length)) throw new Error("选择无效。");
    return [...new Set(indexes.map((index) => choices[index - 1].id))];
  }

  close() {
    this.#readline?.close();
    this.#readline = null;
    if (stdin.isTTY && typeof stdin.setRawMode === "function" && stdin.isRaw) stdin.setRawMode(false);
    if (stdout.isTTY) stdout.write("\x1b[?25h");
  }
}
