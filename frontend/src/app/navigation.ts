import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useMemo } from "react";

export function useAppNavigation() {
  const navigate = useNavigate();
  return useMemo(() => ({
    push: (to: string) => { void navigate(to); },
    replace: (to: string, options?: { scroll?: boolean }) => {
      void navigate(to, { replace: true });
      if (options?.scroll !== false) window.scrollTo(0, 0);
    },
  }), [navigate]);
}
export const useCurrentPath = () => useLocation().pathname;
export const useQuery = () => useSearchParams()[0];
