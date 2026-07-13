import { View, Text, Button } from "react-native";
import { useRouter } from "expo-router";
import { clearAuth } from "../services/authService";

export default function Dashboard() {
  const router = useRouter();

  const logout = async () => {
    await clearAuth();
    router.replace("/");
  };

  return (
    <View style={{ padding: 20, marginTop: 100 }}>
      <Text>Mobile Dashboard</Text>

      <Button title="Open SOS" onPress={() => router.push("/sos")} />
      <Button title="Open profile" onPress={() => router.push("/profile")} />
      <Button title="Logout" onPress={logout} />
    </View>
  );
}