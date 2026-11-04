import { type User } from "@/shared/auth/types";
import { createContext, useContext } from "react";

export const Hub = createContext<{
  user: User;
  notify: (s: string) => void;
  go: (s: string) => void;
  source: (id: string, chunk?: string) => void;
  act: (fn: () => Promise<void>) => Promise<void>;
  busy: boolean;
}>(null!);

export const useHub = () => useContext(Hub);
