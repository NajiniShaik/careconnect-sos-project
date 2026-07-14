import React from "react";
import ResidentProfileScreen from "../../screens/ResidentProfileScreen.jsx";

export default function ContactsRoute() {
  return (
    <ResidentProfileScreen
      pageTitle="Emergency contacts"
      pageSubtitle="Manage your trusted emergency contacts and keep your list up to date."
      showProfile={false}
      showContactManager={true}
    />
  );
}
