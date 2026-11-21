import type { Metadata } from "next";
import { Suspense } from "react";
import { Be_Vietnam_Pro, Plus_Jakarta_Sans } from "next/font/google";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./globals.css";
import "./clinical.css";
import { DemoProvider } from "@/components/demo-context";
import { ReviewProvider } from "@/components/review-context";
import { AppShell } from "@/components/layout/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-vietnam",
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["vietnamese", "latin"],
  weight: ["500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Sepsis Signal · Khoa Cấp cứu Vinmec",
    template: "%s · Sepsis Signal",
  },
  description:
    "Bảng theo dõi diễn biến và cảnh báo sớm nguy cơ nhiễm khuẩn huyết tại Khoa Cấp cứu.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="vi"
      className={`${beVietnamPro.variable} ${plusJakartaSans.variable}`}
    >
      <body>
        <DemoProvider>
          <ReviewProvider>
            <TooltipProvider>
              <Suspense
                fallback={
                  <main className="page-canvas" role="status">
                    Đang tải bảng theo dõi lâm sàng…
                  </main>
                }
              >
                <AppShell>{children}</AppShell>
              </Suspense>
            </TooltipProvider>
          </ReviewProvider>
        </DemoProvider>
      </body>
    </html>
  );
}
