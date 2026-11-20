import type { Metadata } from "next";
import { Suspense } from "react";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@/app/globals.css";
import "@/app/clinical.css";
import { ReviewProvider } from "@/components/providers/review-provider";
import { AuthBoundary } from "@/components/auth/auth-boundary";
import { AuthProvider } from "@/components/providers/auth-provider";

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
        <AuthProvider>
          <ReviewProvider>
            <Suspense
              fallback={
                <main className="page" role="status">
                  Đang tải không gian lâm sàng…
                </main>
              }
            >
              <AuthBoundary>{children}</AuthBoundary>
            </Suspense>
          </ReviewProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
