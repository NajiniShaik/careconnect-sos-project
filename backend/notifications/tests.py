from unittest.mock import patch

from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from .models import DeviceToken, Notification, NotificationDelivery
from .tasks import send_email_notification_task, send_push_notification_task


class NotificationDeviceRegistrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.user = self.user_model.objects.create_user(
            username="resident_token",
            email="resident_token@example.com",
            password="testpass123",
            role="RESIDENT",
        )

    def test_register_device_token_requires_authentication(self):
        response = self.client.post(
            "/api/notifications/register-device/",
            {"device_token": "abc123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_register_device_token_saves_to_user_profile(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/notifications/register-device/",
            {"device_token": "abc123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.device_token, "abc123")
        self.assertEqual(response.data["success"], True)

    def test_register_device_token_rejects_blank_token(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/notifications/register-device/",
            {"device_token": " "},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["success"], False)

    def test_register_device_token_persists_device_token_record(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/notifications/register-device/",
            {"device_token": "android-token-123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(DeviceToken.objects.filter(user=self.user, token="android-token-123").exists())


class NotificationListAndReadTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.user = self.user_model.objects.create_user(
            username="resident_notify",
            email="resident_notify@example.com",
            password="testpass123",
            role="RESIDENT",
        )

    def test_list_notifications_returns_user_notifications(self):
        Notification.objects.create(user=self.user, title="SOS alert", body="Emergency", kind="SOS", read=False)
        Notification.objects.create(user=self.user, title="Welcome", body="Hello", kind="ANNOUNCEMENT", read=True)

        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/notifications/notifications/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(response.data[0]["title"], "Welcome")

    def test_mark_all_notifications_read(self):
        Notification.objects.create(user=self.user, title="SOS alert", body="Emergency", kind="SOS", read=False)
        Notification.objects.create(user=self.user, title="Welcome", body="Hello", kind="ANNOUNCEMENT", read=False)

        self.client.force_authenticate(user=self.user)
        response = self.client.post("/api/notifications/mark-all-read/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Notification.objects.filter(user=self.user, read=False).count(), 0)

    def test_list_notifications_includes_delivery_history(self):
        notification = Notification.objects.create(user=self.user, title="SOS alert", body="Emergency", kind="SOS", read=False)
        NotificationDelivery.objects.create(notification=notification, channel="Email", recipient="admin@example.com", status="Sent")
        NotificationDelivery.objects.create(notification=notification, channel="SMS", recipient="+919441824096", status="Failed")

        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/notifications/notifications/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["message"], "Emergency")
        self.assertEqual(response.data[0]["deliveries"][0]["channel"], "Email")
        self.assertEqual(response.data[0]["deliveries"][1]["recipient"], "+919441824096")

    def test_email_task_creates_delivery_record_for_notification(self):
        notification = Notification.objects.create(user=self.user, title="SOS alert", body="Emergency", kind="SOS", read=False)

        with patch("notifications.tasks.NotificationService.send_email_notification", return_value=True):
            send_email_notification_task(
                ["admin@example.com"],
                "SOS Alert",
                "notifications/sos_notification",
                context={"notification_id": notification.id},
            )

        self.assertEqual(notification.deliveries.count(), 1)
        delivery = notification.deliveries.first()
        self.assertEqual(delivery.channel, "Email")
        self.assertEqual(delivery.recipient, "admin@example.com")
        self.assertEqual(delivery.status, "Sent")

    def test_push_task_creates_delivery_record_for_notification(self):
        notification = Notification.objects.create(user=self.user, title="SOS alert", body="Emergency", kind="SOS", read=False)

        with patch("notifications.tasks.NotificationService.send_push_notification", return_value=True):
            send_push_notification_task(
                ["device-token-123"],
                "Emergency SOS Alert",
                "Emergency",
                data={"notification_id": notification.id},
            )

        self.assertEqual(notification.deliveries.count(), 1)
        delivery = notification.deliveries.first()
        self.assertEqual(delivery.channel, "Push")
        self.assertEqual(delivery.recipient_address, "device-t...-123")
        self.assertEqual(delivery.status, "Sent")
