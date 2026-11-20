export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "doctor" | "viewer";
  isDemo: boolean;
}
export interface DemoAccount { username: string; displayName: string; password: string }
