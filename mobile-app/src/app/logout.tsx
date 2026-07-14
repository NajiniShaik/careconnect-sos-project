import { useEffect } from "react";
import { useRouter } from "expo-router";
import { clearAuth } from "../services/authService";

export default function LogoutScreen() {
  const router = useRouter();

  useEffect(() => {
    const performLogout = async () => {
      try {
        console.log("[logout-route] Starting logout...");
        await clearAuth();
        console.log("[logout-route] Auth cleared, redirecting to index...");
        
        // Small delay to ensure state is cleared
        setTimeout(() => {
          router.replace("/");
        }, 100);
      } catch (error) {
        console.error("[logout-route] Error during logout:", error);
        // Still redirect even if there's an error
        router.replace("/");
      }
    };

    performLogout();
  }, [router]);

  return null;
}
