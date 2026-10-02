import type { Metadata } from "next";
import "@/packages/ui/styles.css";

export const metadata: Metadata = {
  title: "求职 X-Ray",
  description: "可追溯的求职分析"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
