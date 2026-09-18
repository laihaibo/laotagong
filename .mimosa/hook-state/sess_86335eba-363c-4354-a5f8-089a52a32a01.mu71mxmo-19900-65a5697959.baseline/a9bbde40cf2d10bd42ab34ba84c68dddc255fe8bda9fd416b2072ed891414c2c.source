"use client";

import { useEffect } from "react";

/**
 * 路由级错误边界。
 *
 * 没有它的时候，任何一处客户端异常都会让整页变成白屏或浏览器的
 * 「This page couldn't load」，**看不到任何线索**——排查只能靠猜。
 * 有了它至少能拿到错误信息与堆栈。
 *
 * 附带一个「清空本机数据」的出口：数据在 localStorage 里，
 * 如果坏数据本身就导致载入即崩，那是唯一的自救路径。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 同时打到控制台，方便复制给开发看
    console.error("[老太公] 页面异常：", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="glass-card w-full max-w-lg rounded-3xl p-6">
        <h1 className="text-title font-semibold tracking-tight text-[var(--ink)]">
          页面出错了
        </h1>
        <p className="mt-1 text-caption text-[var(--ink-soft)]">
          刷新通常能恢复。如果反复出现，把下面这段信息发给我。
        </p>

        <pre className="mt-4 max-h-40 overflow-auto rounded-2xl border border-[var(--glass-edge)] bg-[var(--glass)] p-3 text-caption leading-relaxed whitespace-pre-wrap text-[var(--ink-soft)]">
          {error?.message || "未知错误"}
          {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
          {error?.stack ? `\n\n${error.stack}` : ""}
        </pre>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="glass-btn rounded-2xl px-4 py-2 text-body text-[var(--ink)]"
          >
            重试
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="glass-btn rounded-2xl px-4 py-2 text-body text-[var(--ink)]"
          >
            刷新页面
          </button>
          <button
            type="button"
            onClick={() => {
              const ok = window.confirm(
                "这会清空本机保存的全部家族数据，且不可恢复。\n\n建议先导出备份（如果页面还能用）。确定清空？"
              );
              if (!ok) return;
              try {
                window.localStorage.removeItem("laotagong:family:v1");
              } catch {
                /* 忽略：清不掉也只能刷新 */
              }
              window.location.reload();
            }}
            className="rounded-2xl px-4 py-2 text-body text-[var(--danger)]"
          >
            清空本机数据
          </button>
        </div>
      </div>
    </div>
  );
}
