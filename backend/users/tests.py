from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient


class UserAvailabilityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.security_user = self.user_model.objects.create_user(
            username="security_availability",
            email="security_availability@example.com",
            password="testpass123",
            role="SECURITY",
        )

    def test_security_user_can_update_availability_via_security_endpoint(self):
        self.client.force_authenticate(user=self.security_user)

        response = self.client.patch("/api/security/availability/", {"is_available": True}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_available"])

        follow_up = self.client.get("/api/security/availability/")

        self.assertEqual(follow_up.status_code, status.HTTP_200_OK)
        self.assertTrue(follow_up.data["is_available"])
