from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from .models import SOS


class SOSCategoryFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.user = self.user_model.objects.create_user(
            username="resident1",
            email="resident@example.com",
            password="testpass123",
            role="RESIDENT",
        )
        self.security_user = self.user_model.objects.create_user(
            username="security1",
            email="security@example.com",
            password="testpass123",
            role="SECURITY",
        )
        self.admin_user = self.user_model.objects.create_user(
            username="admin1",
            email="admin@example.com",
            password="testpass123",
            role="ADMIN",
        )

    def test_categories_endpoint_returns_master_data(self):
        response = self.client.get("/api/sos/categories/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("categories", response.data)
        self.assertTrue(len(response.data["categories"]) > 0)

    def test_sos_creation_accepts_category(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            "/api/sos/trigger/",
            {
                "message": "Need urgent help",
                "location": "Block 3",
                "category": "medical",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["category"], "medical")
        self.assertTrue(SOS.objects.filter(user=self.user).exists())
        saved_sos = SOS.objects.get(user=self.user)
        self.assertEqual(saved_sos.category, "medical")

    def test_resident_can_view_only_their_own_alerts(self):
        other_user = self.user_model.objects.create_user(
            username="resident2",
            email="resident2@example.com",
            password="testpass123",
            role="RESIDENT",
        )
        SOS.objects.create(user=self.user, message="Mine", location="A", category="medical", status="OPEN")
        SOS.objects.create(user=other_user, message="Other", location="B", category="fire", status="OPEN")

        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/sos/alerts/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["message"], "Mine")

    def test_resident_alerts_expose_owner_as_user_object(self):
        self.client.force_authenticate(user=self.user)
        self.client.post(
            "/api/sos/trigger/",
            {
                "message": "Need urgent help",
                "location": "Block 3",
                "category": "medical",
            },
            format="json",
        )

        response = self.client.get("/api/sos/alerts/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data)
        self.assertIsInstance(response.data[0]["user"], dict)
        self.assertEqual(response.data[0]["user"]["id"], self.user.id)
        self.assertEqual(response.data[0]["user"]["username"], self.user.username)

    def test_resident_can_delete_their_own_alert(self):
        sos = SOS.objects.create(user=self.user, message="Mine", location="A", category="medical", status="OPEN")

        self.client.force_authenticate(user=self.user)
        response = self.client.delete(f"/api/sos/alerts/{sos.id}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(SOS.objects.filter(pk=sos.id).exists())

    def test_resident_cannot_delete_another_residents_alert(self):
        other_user = self.user_model.objects.create_user(
            username="resident2",
            email="resident2@example.com",
            password="testpass123",
            role="RESIDENT",
        )
        sos = SOS.objects.create(user=other_user, message="Other", location="B", category="fire", status="OPEN")

        self.client.force_authenticate(user=self.user)
        response = self.client.delete(f"/api/sos/alerts/{sos.id}/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(SOS.objects.filter(pk=sos.id).exists())

    def test_security_can_view_all_alerts_but_not_patch_or_delete(self):
        sos = SOS.objects.create(user=self.user, message="Need help", location="A", category="fire", status="OPEN")

        self.client.force_authenticate(user=self.security_user)
        list_response = self.client.get("/api/sos/alerts/")
        patch_response = self.client.patch(f"/api/sos/alerts/{sos.id}/", {"status": "RESOLVED"}, format="json")
        delete_response = self.client.delete(f"/api/sos/alerts/{sos.id}/")

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_response.data), 1)
        self.assertEqual(patch_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(delete_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_view_all_alerts_patch_and_delete(self):
        sos = SOS.objects.create(user=self.user, message="Need help", location="A", category="medical", status="OPEN")

        self.client.force_authenticate(user=self.admin_user)
        list_response = self.client.get("/api/sos/alerts/")
        patch_response = self.client.patch(f"/api/sos/alerts/{sos.id}/", {"status": "IN_PROGRESS"}, format="json")
        delete_response = self.client.delete(f"/api/sos/alerts/{sos.id}/")

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_response.data), 1)
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_response.data["status"], "IN_PROGRESS")
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)

