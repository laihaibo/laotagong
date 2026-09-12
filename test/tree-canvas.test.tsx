/**
 * 画布交互的回归测试。
 *
 * 这里守着的是一个**真实把整页打崩过的** bug：
 * 平移时在 `setView` 的 updater 里读 `panOrigin.current`。updater 不会立刻执行
 * （pointermove 是连续事件，React 会推迟），而 pointerup 已经把它置空，
 * 于是 `null.vx` → TypeError → 整棵树被错误边界接管。
 *
 * 复现要点：down / move / up 必须在**同一个 act 里**发生，
 * 这样 updater 才确实被推迟到了 updater 读到空 ref 之后。
 * 分开放的话 React 会在每个事件结束时就把状态刷掉，测不出问题。
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FamilyTree } from "@/components/family-tree";
import { createPerson, type FamilyState, type Person } from "@/lib/family";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

function family(): FamilyState {
  const persons: Record<string, Person> = {};
  for (const [id, gender, year] of [
    ["GF", "male", "1940"],
    ["GM", "female", "1945"],
    ["ME", "male", "1990"],
  ] as const) {
    persons[id] = createPerson({ id, name: id, gender, birthYear: year, createdAt: 1 });
  }
  return {
    version: 1,
    persons,
    parents: { ME: { fatherId: "GF", motherId: "GM" } },
    spouses: [{ a: "GF", b: "GM" }],
    meId: "ME",
  };
}

/**
 * 造一个能被 React 的 onPointer* 处理的事件。
 *
 * jsdom 的 `MouseEvent.clientX/clientY` 是只读的（Object.assign 会抛），
 * 所以坐标必须走构造函数；`pointerId` 不在 MouseEventInit 里，单独定义。
 */
function pointer(type: string, init: { pointerId: number; clientX: number; clientY: number }) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperty(event, "pointerId", {
    value: init.pointerId,
    configurable: true,
  });
  return event;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("家族树画布 · 指针交互", () => {
  it("拖拽后立刻抬手不会崩（updater 不得读已置空的 ref）", async () => {
    await act(async () => {
      root.render(
        <FamilyTree
          state={family()}
          focusId="ME"
          onOpenPerson={() => {}}
          onAddRelation={() => {}}
          onSetMe={() => {}}
        />
      );
    });

    const canvas = container.querySelector("[data-tree-canvas]");
    expect(canvas).not.toBeNull();

    // 关键：三个阶段放在同一个 act 里，逼出「updater 被推迟」的时序
    expect(() => {
      act(() => {
        canvas!.dispatchEvent(pointer("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }));
        canvas!.dispatchEvent(pointer("pointermove", { pointerId: 1, clientX: 160, clientY: 140 }));
        canvas!.dispatchEvent(pointer("pointermove", { pointerId: 1, clientX: 220, clientY: 180 }));
        canvas!.dispatchEvent(pointer("pointerup", { pointerId: 1, clientX: 220, clientY: 180 }));
      });
    }).not.toThrow();
  });

  it("抬手之后再移动指针，不再改变视图也不崩", async () => {
    await act(async () => {
      root.render(
        <FamilyTree
          state={family()}
          focusId="ME"
          onOpenPerson={() => {}}
          onAddRelation={() => {}}
          onSetMe={() => {}}
        />
      );
    });
    const canvas = container.querySelector("[data-tree-canvas]")!;

    expect(() => {
      act(() => {
        canvas.dispatchEvent(pointer("pointerdown", { pointerId: 2, clientX: 50, clientY: 50 }));
        canvas.dispatchEvent(pointer("pointerup", { pointerId: 2, clientX: 50, clientY: 50 }));
        // 抬手之后还在动（触摸设备上常见），此时 panOrigin 已是 null
        canvas.dispatchEvent(pointer("pointermove", { pointerId: 2, clientX: 90, clientY: 90 }));
      });
    }).not.toThrow();
  });

  it("三个动作按钮都渲染出来，且点击不会启动拖拽", async () => {
    await act(async () => {
      root.render(
        <FamilyTree
          state={family()}
          focusId="ME"
          onOpenPerson={() => {}}
          onAddRelation={() => {}}
          onSetMe={() => {}}
        />
      );
    });

    const node = container.querySelector("[data-tree-node]");
    expect(node).not.toBeNull();

    for (const title of ["增加关系", "详情", "设为「我」"]) {
      expect(node!.querySelector(`[title="${title}"]`)).not.toBeNull();
    }

    // 动作区吞掉 pointerdown，所以按下去不会开始平移
    const actions = node!.querySelector('[title="增加关系"]')!.parentElement!;
    expect(() => {
      act(() => {
        actions.dispatchEvent(pointer("pointerdown", { pointerId: 3, clientX: 10, clientY: 10 }));
        actions.dispatchEvent(pointer("pointerup", { pointerId: 3, clientX: 10, clientY: 10 }));
      });
    }).not.toThrow();
  });
});
