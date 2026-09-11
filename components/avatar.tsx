"use client";

import { useState } from "react";

import type { Person } from "@/lib/family";
import { cn } from "@/lib/utils";

/**
 * 头像：有 photoUrl 时显示照片，加载失败或无链接时回退到「姓名首字 + 性别渐变」。
 *
 * 首字**始终留在 DOM 里**，照片盖在它上层——加载失败时把照片去掉，
 * 底下就是回退头像，不可能出现破图图标。
 */
export function Avatar({
  person,
  size,
  className,
}: {
  person: Person;
  size: "lg" | "sm" | "xs";
  className?: string;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = !!person.photoUrl && !photoFailed;

  return (
    <div
      className={cn(
        "avatar-ring relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl font-semibold text-white",
        size === "lg" && "h-14 w-14 text-subtitle",
        size === "sm" && "h-9 w-9 text-caption",
        size === "xs" && "h-7 w-7 text-caption",
        person.gender === "male" && "avatar-male",
        person.gender === "female" && "avatar-female",
        person.gender === "unknown" && "avatar-unknown",
        className
      )}
    >
      <span aria-hidden={showPhoto}>{person.name.slice(0, 1)}</span>
      {showPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- 外置链接，不走 next/image
        <img
          src={person.photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setPhotoFailed(true)}
        />
      )}
    </div>
  );
}
