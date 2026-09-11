# Consensus Plan: 老太公 · 家族图谱 Apple Style 重构

> **Status: `pending approval`** — 本计划由 deep-interview spec（歧义度 19%，34 条 AC）经 RALPLAN-DR **deliberate** 模式两轮共识精炼产出。
> 共识路径：Planner 迭代 1（517 行）→ Architect 评审（REJECT 级发现：P1/P4 原则违反）+ Critic 独立评审（REJECTED，9 项阻塞缺陷）→ Planner 迭代 2 修复全部 9 项 + 13 项非阻塞项 → Orchestrator 定点验证通过（critic-2 随会话中断丢失，由主会话抽查 B1/B5/B8/B9 关键裁决点替代，验证深度已在下方标注）。

## ADR (Architecture Decision Record)

### Decision
按 **9 阶段串行主干 + 3 层并行 DAG（Step 7a–7k）** 执行：测试脚手架先行（Step 0/0b）→ 数据层修复与对称化（Step 1–2）→ token 层 + 字阶迁移原子落地（Step 3+3b，同 agent 同 landing，前置于拆分）→ 弹窗响应式（Step 4）→ 布局骨架（Step 5）→ 巨石文件拆分至目标边界（Step 6，拆 6a 纯移动 / 6b hook 抽取两段契约）→ 逐文件重设计（Step 7）→ 文档（Step 8）。

### Drivers
1. **Bug 是数据完整性 bug，不是 UI bug** —— AC-17/18/19/20 全在纯函数层，必须先修并证明，再动像素。
2. **1277 行巨石文件是单写者瓶颈** —— 拆分完成前不存在真正的并行。
3. **零测试基础设施** —— harness 是 Driver 1/2 的唯一回归防护，且必须接入 CI 才算数。

### Alternatives Considered
| 决策 | 选定 | 被否决 |
|---|---|---|
| D1 执行顺序 | O1-C 直接拆至目标边界（6a/6b 两段契约） | O1-A 先拆后设计（边界会被重设计摧毁，1277 行碰两遍）；O1-B 原地重设计（巨石全程是争夺焦点，无 oracle） |
| D2 token 层 | `@theme inline` + `--text-*: initial` + `@custom-variant dark`；玻璃材质留在任意值 | 纯任意值语法（AC-2/3 无强制机制）；全量语义化迁移（三套颜色机制并存更糟） |
| D3 弹窗动画 | `tw-animate-css`（零类字符串改动） | 手写 keyframes（~60 行 + 永久维护 Radix 状态机）；放弃动画（违背 AC-15 前提） |

### Why Chosen
- **D1**：评审证明 O1-C 原形态声称的 per-file oracle 与提前并行**都不存在**（visual-freeze 是累积基线、Step 6 串行），故拆 6a（13 纯移动，逐文件比对固定 id 基线）/6b（hook 抽取，明写 refactor + 行为 oracle），让 O1-C 真正拿到它声称的优势。
- **D2**：AC-2 的 13px 下限靠 `--text-*: initial` 成为硬门（`@theme` 只增不删已本地编译验证）；`initial` 必须**第一行**（否则清掉自定义档位）；3b 必须前置于 Step 6，否则 verbatim oracle 失效。
- **D3**：本地下载 dist 验证 bare 类与 `--tw-duration` 链路完整成立，「零改动」断言为真。

### Consequences
- ✅ 34 条 AC 每条有具名验证手段；每步 `pnpm build` 绿（3+3b 原子 landing 为**显式声明的唯一例外**）
- ✅ CI 接入 `verify`（unit + contrast 漂移守卫）与 `e2e`（Playwright 缓存）job，`--frozen-lockfile`
- ✅ AC-3 **部分满足**并记录原因（`--spacing` 重定义判 Severe，8px 网格不追溯既有工具类）
- ⚠️ `applyRepairs` **可恢复但不可撤销**（无历史日志；真 undo 属新范围）
- ⚠️ 深色模式 `--ink-faint` tier collapse（AA 逼出的收敛），层级表达转移至字阶
- ⚠️ 验证深度标注：迭代 2 未经第二轮 Architect+Critic 全量评审（用户要求加速，改为定点抽查）；critic-2 定点验证随会话中断丢失，由 orchestrator 抽查替代

### Follow-ups（批准时需一并决定）
1. `package.json` 工作区已删 `packageManager: pnpm@9.15.9`（非本会话所为）——**建议提交**（CI `deploy.yml:24-27` 自带 pnpm 9 pin，不依赖该字段；本机 pnpm 11.22.0 需要删除才正常）。Step 0 是 `package.json` 唯一写者，脏文件无法开工。
2. Appendix 5 项开放项的默认取向：`d=0` 标「同辈」；AC-3 记部分满足；修复提示条**保留**（裁掉会让 P4 的 ambiguous 处理不可达）；`applyRepairs` 不做真 undo。

---

