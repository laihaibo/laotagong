## Handoff: team-plan/team-prd → team-exec

- **Decided**: 9 阶段串行主干 + 3 层并行 DAG。串行 backbone = Step 0/0b → 1 → 2 → 3+3b（原子 landing）→ 4 → 5 → 6(6a/6b)。Step 7 DAG：7b→7a→7f / 7c→7d / 7i→7e+7h / 7g,7j 层0 / 7k 串行收口。Step 8 文档收尾。分支 `redesign/apple-style`，每步一 commit，`pnpm build` 每步绿（3+3b 为显式唯一例外）。
- **Rejected**: O1-A 先拆后设计（边界被重设计摧毁）；O1-B 原地重设计（巨石全程争夺焦点）；O2-A 纯任意值（AC-2/3 无强制）；O3-B 手写 keyframes；O3-C 放弃动画。
- **Risks**: ① package.json 工作区脏（packageManager 被删）——Step 0 第一个动作是提交它（用户已批准此处置）。② `--text-*: initial` 必须是 @theme 第一行，3b 必须前置于 Step 6。③ `isUnambiguousBackfill` 求值点钉死 post-add。④ AC-4 唯一机器证据是 e2e/contrast.spec.ts 像素采样（check-contrast.mjs 只是漂移守卫）。⑤ 所有 [data-card] 断言先 not.toHaveCount(0)。
- **Files**: 计划 .omc/plans/consensus-laotagong-redesign.md（767 行，normative §3.7 文件归属表）；spec .omc/specs/deep-interview-laotagong-redesign.md（34 AC）。
- **Remaining**: backbone 完成后按 DAG 派 7a–7k 并行 worker；随后 team-verify（verifier + code-reviewer，>20 文件 → 必含 code-reviewer）。
