import { type User } from "@/shared/auth/types";
import { roleNames } from "@/shared/lib/labels";

export const hasRole = (u: User, role: string, departmentId?: string) =>
  departmentId
    ? u.role_grants?.some(
        (g) => g.role === role && g.department_id === departmentId,
      )
    : u.roles?.includes(role) || false;

export const hasAnyRole = (u: User, roles: string[]) =>
  roles.some((r) => hasRole(u, r));

export const roleSummary = (u: User) =>
  (u.roles || []).map((r) => roleNames[r] || r).join(" · ");
