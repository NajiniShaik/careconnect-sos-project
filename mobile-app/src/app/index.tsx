import { useEffect, useState, useCallback } from 'react';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getStoredToken } from '../services/authService';
import LoginScreen from '../screens/LoginScreen.js'

export default function Home() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [showLogin, setShowLogin] = useState(false);
  const forcedLogout = params?.logout === '1' || params?.logout === 'true';

  const checkAndNavigate = useCallback(async () => {
    try {
      console.log("[index] Checking auth state...");

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
  }, [forcedLogout, router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void checkAndNavigate();
    }, 0);

    return () => clearTimeout(timer);
  }, [checkAndNavigate]);

  useFocusEffect(
    useCallback(() => {
      console.log("[index] Page focused, re-checking auth...");
      void checkAndNavigate();
    }, [checkAndNavigate])
  );

  return showLogin ? <LoginScreen /> : null;
}