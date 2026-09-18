import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "老太公 · 家族图谱",
  description: "以「我」为中心的家族关系图谱，记录户籍与籍贯，数据本地保存。",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "老太公",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#eef2f7",
};

const bootTheme = `
(function(){
  try {
    var m = localStorage.getItem("laotagong:theme") || "light";
    var r = m === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : m;
    document.documentElement.classList.remove("light","dark");
    document.documentElement.classList.add(r);
    document.documentElement.style.colorScheme = r;
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootTheme }} />
      </head>
      <body className="antialiased">
        <div className="ambient" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
