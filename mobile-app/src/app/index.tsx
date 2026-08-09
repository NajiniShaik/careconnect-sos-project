import { useEffect, useState, useCallback } from 'react';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getStoredToken } from '../services/authService';
import LandingScreen from '../screens/LandingScreen.js';

export default function Home() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [showLanding, setShowLanding] = useState(false);
  const forcedLogout = params?.logout === '1' || params?.logout === 'true';

  const checkAndNavigate = useCallback(async () => {
    try {
      console.log("[index] Checking auth state...");

      if (forcedLogout) {
        console.log("[index] Forced logout detected, showing landing screen");
        setShowLanding(true);
        return;
      }

      const token = await getStoredToken();

      if (token) {
        console.log("[index] Token found, navigating to dashboard");
        router.replace("/dashboard");
      } else {
        console.log("[index] No token, showing landing screen");
        setShowLanding(true);
      }
    } catch (error) {
      console.error("[index] Error checking auth:", error);
      setShowLanding(true);
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

  return showLanding ? <LandingScreen /> : null;
}