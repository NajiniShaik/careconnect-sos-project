import { Tabs } from "expo-router";
import { AppIcon, appColors } from "../../components/common/designSystem";

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: appColors.blue,
        tabBarInactiveTintColor: appColors.slate,
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: appColors.border,
          height: 72,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <AppIcon name="home-outline" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color }) => <AppIcon name="warning-outline" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: "Contacts",
          tabBarIcon: ({ color }) => <AppIcon name="people-outline" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Notifications",
          tabBarIcon: ({ color }) => <AppIcon name="time-outline" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <AppIcon name="settings-outline" size={18} color={color} />,
        }}
      />
    </Tabs>
  );
}
