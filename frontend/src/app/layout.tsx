import type { Metadata } from "next";
import { Suspense } from "react";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./globals.css";
import "./clinical.css";
import { ReviewProvider } from "@/components/review-context";
import { AppShell } from "@/components/layout/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: {
    default: "Sepsis Signal · Không gian lâm sàng",
    template: "%s · Sepsis Signal",
  },
  description:
    "Hệ thống AI hỗ trợ cảnh báo sớm nguy cơ nhiễm khuẩn huyết. Không gian trải nghiệm trên EMR mô phỏng.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        <ReviewProvider>
          <TooltipProvider>
            <Suspense
              fallback={
                <main className="page" role="status">
                  Đang tải không gian lâm sàng…
                </main>
              }
            >
              <AppShell>{children}</AppShell>
            </Suspense>
          </TooltipProvider>
        </ReviewProvider>
      </body>
    </html>
  );
}
