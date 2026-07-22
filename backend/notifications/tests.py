from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status


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
