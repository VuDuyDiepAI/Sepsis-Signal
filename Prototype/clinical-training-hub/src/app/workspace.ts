import { hasAnyRole, hasRole } from "@/shared/auth/permissions";
import { type User } from "@/shared/auth/types";

export type Workspace = "management" | "review" | "staff";

export function workspaceFor(user: User): Workspace {
  if (hasAnyRole(user, ["ADMIN"])) return "management";
  if (hasRole(user, "REVIEWER")) return "review";
  return "staff";
}

const screens: Record<Workspace, string[]> = {
  management: [
    "dashboard",
    "research",
    "manage-documents",
    "builder",
    "courses",
    "reports",
    "jobs",
    "feedback",
    "admin",
  ],
  review: ["dashboard", "research", "reviews"],
  staff: [
    "dashboard",
    "research",
    "chat",
    "documents",
    "my-training",
    "calendar",
    "credentials",
  ],
};

const required: Record<string, string[]> = {
  research: ["STAFF", "ADMIN", "REVIEWER"],
  "manage-documents": ["ADMIN"],
  builder: ["ADMIN"],
  courses: ["ADMIN"],
  reports: ["ADMIN"],
  jobs: ["ADMIN"],
  reviews: ["REVIEWER"],
  admin: ["ADMIN"],
  feedback: ["ADMIN"],
  chat: ["STAFF"],
  documents: ["STAFF"],
  "my-training": ["STAFF"],
  calendar: ["STAFF"],
  credentials: ["STAFF"],
};

export function canOpenPage(user: User, path: string) {
  const base = path.split(/[/?]/)[0];
  const screen = base === "learn" ? "my-training" : base;
  return (
    screens[workspaceFor(user)].includes(screen) &&
    (!required[screen] || hasAnyRole(user, required[screen]))
  );
}

export const workspaceLabel = (u: User) =>
  ({
    management: "Quản lý đào tạo",
    review: "Kiểm duyệt chuyên môn",
    staff: "Học tập cá nhân",
  })[workspaceFor(u)];
