# Temporary additional tests for SOS message access and closure timeline behavior.
# This file is not required by the main suite but can be used for local verification.
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from users.models import GuardianProfile
from .models import SOS, SOSMessage, ChatMessage
from notifications.models import Notification


class SOSMessageAccessAndClosureTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.admin_user = self.user_model.objects.create_user(
            username="admin_messages",
            email="admin_messages@example.com",
            password="testpass123",
            role="ADMIN",
        )
        self.security_user = self.user_model.objects.create_user(
            username="security_messages",
            email="security_messages@example.com",
            password="testpass123",
            role="SECURITY",
        )
        self.volunteer_user = self.user_model.objects.create_user(
            username="volunteer_messages",
            email="volunteer_messages@example.com",
            password="testpass123",
            role="VOLUNTEER",
        )
        self.resident_user = self.user_model.objects.create_user(
            username="resident_messages",
            email="resident_messages@example.com",
            password="testpass123",
            role="RESIDENT",
        )
        self.guardian_user = self.user_model.objects.create_user(
            username="guardian_messages",
            email="guardian_messages@example.com",
            password="testpass123",
            role="GUARDIAN",
        )
        GuardianProfile.objects.create(user=self.guardian_user, resident_name=self.resident_user.username, relationship="Parent")

    def test_admin_and_security_can_read_messages(self):
        sos = SOS.objects.create(user=self.resident_user, message="Need help", location="A", category="medical")
        SOSMessage.objects.create(sos=sos, sender=self.resident_user, message="First update")

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(f"/api/sos/{sos.id}/messages/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["message"], "First update")

        self.client.force_authenticate(user=self.security_user)
        response = self.client.get(f"/api/sos/{sos.id}/messages/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_volunteer_can_read_messages_if_visible(self):
        sos = SOS.objects.create(user=self.resident_user, message="Need help", location="A", category="medical")
        Notification.objects.create(
            user=self.volunteer_user,
            title="Incident assigned",
            body="",
            kind="SOS",
            data={"type": "SOS_ASSIGNMENT", "alert_id": str(sos.id), "recipient_role": "VOLUNTEER", "broadcast": True},
        )
        SOSMessage.objects.create(sos=sos, sender=self.resident_user, message="First update")

        self.client.force_authenticate(user=self.volunteer_user)
        response = self.client.get(f"/api/sos/{sos.id}/messages/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["message"], "First update")

    def test_guardian_can_read_messages_for_linked_resident(self):
        sos = SOS.objects.create(user=self.resident_user, message="Need help", location="A", category="medical")
        SOSMessage.objects.create(sos=sos, sender=self.resident_user, message="First update")

        self.client.force_authenticate(user=self.guardian_user)
        response = self.client.get(f"/api/sos/{sos.id}/messages/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["message"], "First update")

    def test_chat_history_endpoint_returns_messages_for_allowed_roles(self):
        sos = SOS.objects.create(user=self.resident_user, message="Need help", location="A", category="medical", status="OPEN")
        ChatMessage.objects.create(incident=sos, sender=self.resident_user, message="Hello from resident")
        ChatMessage.objects.create(incident=sos, sender=self.admin_user, message="Hello from admin", is_system_message=True)

        self.client.force_authenticate(user=self.resident_user)
        response = self.client.get(f"/api/sos/{sos.id}/chat/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

        self.client.force_authenticate(user=self.security_user)
        response = self.client.get(f"/api/sos/{sos.id}/chat/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_closing_incident_creates_closure_message(self):
        sos = SOS.objects.create(user=self.resident_user, message="Need help", location="A", category="medical", status="OPEN")

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.patch(
            f"/api/sos/{sos.id}/",
            {
                "status": "CLOSED",
                "closure_notes": "Closed notes",
                "resolution_summary": "Resolved summary",
                "actions_taken": "Actions done",
                "additional_remarks": "Remarks here",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        sos.refresh_from_db()
        self.assertEqual(sos.status, "CLOSED")
        self.assertTrue(SOSMessage.objects.filter(sos=sos, message__contains="Closure notes:").exists())
        self.assertTrue(SOSMessage.objects.filter(sos=sos, message__contains="Resolution summary:").exists())

        self.client.force_authenticate(user=self.resident_user)
        response = self.client.get(f"/api/sos/{sos.id}/messages/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(any("Closure notes:" in item["message"] for item in response.data))

    def test_admin_can_send_chat_message(self):
        sos = SOS.objects.create(user=self.resident_user, message="Need help", location="A", category="medical")

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f"/api/sos/{sos.id}/chat/",
            {"message": "Admin message"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["message"], "Admin message")
        self.assertTrue(ChatMessage.objects.filter(incident=sos, sender=self.admin_user, message="Admin message").exists())

    def test_assigned_volunteer_can_send_chat_message(self):
        sos = SOS.objects.create(user=self.resident_user, message="Need help", location="A", category="medical", assigned_volunteer=self.volunteer_user)

        self.client.force_authenticate(user=self.volunteer_user)
        response = self.client.post(
            f"/api/sos/{sos.id}/chat/",
            {"message": "Volunteer message"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["message"], "Volunteer message")
        self.assertTrue(ChatMessage.objects.filter(incident=sos, sender=self.volunteer_user, message="Volunteer message").exists())

    def test_resident_owner_can_send_chat_message(self):
        sos = SOS.objects.create(user=self.resident_user, message="Need help", location="A", category="medical")

        self.client.force_authenticate(user=self.resident_user)
        response = self.client.post(
            f"/api/sos/{sos.id}/chat/",
            {"message": "Resident message"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["message"], "Resident message")
        self.assertTrue(ChatMessage.objects.filter(incident=sos, sender=self.resident_user, message="Resident message").exists())

    def test_linked_guardian_can_send_chat_message(self):
        sos = SOS.objects.create(user=self.resident_user, message="Need help", location="A", category="medical")

        self.client.force_authenticate(user=self.guardian_user)
        response = self.client.post(
            f"/api/sos/{sos.id}/chat/",
            {"message": "Guardian message"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["message"], "Guardian message")
        self.assertTrue(ChatMessage.objects.filter(incident=sos, sender=self.guardian_user, message="Guardian message").exists())

    def test_security_can_send_chat_message(self):
        sos = SOS.objects.create(user=self.resident_user, message="Need help", location="A", category="medical")

        self.client.force_authenticate(user=self.security_user)
        response = self.client.post(
            f"/api/sos/{sos.id}/chat/",
            {"message": "Security message"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["message"], "Security message")
        self.assertTrue(ChatMessage.objects.filter(incident=sos, sender=self.security_user, message="Security message").exists())

    def test_unrelated_user_cannot_send_chat_message(self):
        sos = SOS.objects.create(user=self.resident_user, message="Need help", location="A", category="medical")
        unrelated_user = self.user_model.objects.create_user(
            username="unrelated_chat_user",
            email="unrelated_chat_user@example.com",
            password="testpass123",
            role="RESIDENT",
        )

        self.client.force_authenticate(user=unrelated_user)
        response = self.client.post(
            f"/api/sos/{sos.id}/chat/",
            {"message": "Forbidden message"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(ChatMessage.objects.filter(incident=sos, message="Forbidden message").exists())

    def test_blank_message_is_rejected(self):
        sos = SOS.objects.create(user=self.resident_user, message="Need help", location="A", category="medical")

        self.client.force_authenticate(user=self.resident_user)
        response = self.client.post(
            f"/api/sos/{sos.id}/chat/",
            {"message": "   "},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ChatMessage.objects.filter(incident=sos).exists())

    @patch("sos.views._broadcast_chat_message")
    def test_post_chat_message_triggers_broadcast(self, mock_broadcast):
        sos = SOS.objects.create(user=self.resident_user, message="Need help", location="A", category="medical")

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f"/api/sos/{sos.id}/chat/",
            {"message": "Broadcast message"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mock_broadcast.assert_called_once()
