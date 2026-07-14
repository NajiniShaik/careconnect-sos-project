import { useEffect, useState, useCallback } from 'react';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getStoredToken } from '../services/authService';
import LoginScreen from '../screens/LoginScreen.js'

export default function Home() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [showLogin, setShowLogin] = useState(false);

  const checkAndNavigate = useCallback(async () => {
    try {
      console.log("[index] Checking auth state...");
      const forcedLogout = params?.logout === '1' || params?.logout === 'true';

      if (forcedLogout) {
        console.log("[index] Forced logout detected, showing login screen");
        setShowLogin(true);
        return;
      }

      const token = await getStoredToken();
      
      if (token) {
        console.log("[index] Token found, navigating to dashboard");
        router.replace("/(app)/dashboard");
      } else {
        console.log("[index] No token, showing login screen");
        setShowLogin(true);
      }
    } catch (error) {
      console.error("[index] Error checking auth:", error);
      setShowLogin(true);
    }
  }, [params?.logout, router]);

  // Initial check on mount
  useEffect(() => {
    checkAndNavigate();
  }, [checkAndNavigate]);

  // Re-check when page comes into focus (after logout)
  useFocusEffect(
    useCallback(() => {
      console.log("[index] Page focused, re-checking auth...");
      checkAndNavigate();
    }, [checkAndNavigate])
  );

  return showLogin ? <LoginScreen /> : null;
}