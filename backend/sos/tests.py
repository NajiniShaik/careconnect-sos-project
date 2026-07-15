from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from .models import SOS, SOSMessage
from .serializers import SOSSerializer


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

    def test_sos_creation_defaults_priority_to_high(self):
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
        self.assertEqual(response.data["priority"], "HIGH")
        saved_sos = SOS.objects.get(user=self.user)
        self.assertEqual(saved_sos.priority, "HIGH")

    def test_sos_creation_accepts_location_coordinates(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            "/api/sos/trigger/",
            {
                "message": "Need urgent help",
                "location": "Block 3",
                "category": "medical",
                "latitude": 12.9716,
                "longitude": 77.5946,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        saved_sos = SOS.objects.get(user=self.user)
        self.assertEqual(saved_sos.latitude, 12.9716)
        self.assertEqual(saved_sos.longitude, 77.5946)

    @patch("sos.views.reverse_geocode_coordinates")
    def test_sos_creation_reverse_geocodes_coordinates_successfully(self, mock_reverse_geocode):
        mock_reverse_geocode.return_value = {
            "address": "123 Main St",
            "city": "Bengaluru",
            "state": "Karnataka",
            "country": "India",
            "location": "123 Main St, Bengaluru, Karnataka, India",
        }

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/sos/trigger/",
            {
                "message": "Need urgent help",
                "location": "Block 3",
                "category": "medical",
                "latitude": 12.9716,
                "longitude": 77.5946,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["location"], "123 Main St, Bengaluru, Karnataka, India")
        self.assertEqual(response.data["address"], "123 Main St")
        self.assertEqual(response.data["city"], "Bengaluru")
        self.assertEqual(response.data["state"], "Karnataka")
        self.assertEqual(response.data["country"], "India")

    @patch("sos.views.reverse_geocode_coordinates")
    def test_sos_creation_keeps_existing_location_when_reverse_geocoding_fails(self, mock_reverse_geocode):
        mock_reverse_geocode.return_value = None

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/sos/trigger/",
            {
                "message": "Need urgent help",
                "location": "Block 3",
                "category": "medical",
                "latitude": 12.9716,
                "longitude": 77.5946,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["location"], "Block 3")
        saved_sos = SOS.objects.get(user=self.user)
        self.assertEqual(saved_sos.location, "Block 3")
        self.assertEqual(saved_sos.latitude, 12.9716)
        self.assertEqual(saved_sos.longitude, 77.5946)

    def test_serializer_response_includes_geocoded_fields(self):
        sos = SOS.objects.create(
            user=self.user,
            message="Need help",
            location="Block 3",
            category="medical",
            latitude=12.9716,
            longitude=77.5946,
            address="123 Main St",
            city="Bengaluru",
            state="Karnataka",
            country="India",
            status="OPEN",
        )

        serializer = SOSSerializer(sos)
        self.assertEqual(serializer.data["location"], "Block 3")
        self.assertEqual(serializer.data["latitude"], 12.9716)
        self.assertEqual(serializer.data["longitude"], 77.5946)
        self.assertEqual(serializer.data["address"], "123 Main St")
        self.assertEqual(serializer.data["city"], "Bengaluru")
        self.assertEqual(serializer.data["state"], "Karnataka")
        self.assertEqual(serializer.data["country"], "India")

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

    def test_resident_can_update_their_own_sos_message_and_coordinates(self):
        sos = SOS.objects.create(user=self.user, message="Need help", location="A", category="medical", status="OPEN")

        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            f"/api/sos/{sos.id}/",
            {
                "message": "Updated incident details",
                "latitude": 12.9716,
                "longitude": 77.5946,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message"], "Updated incident details")
        self.assertEqual(response.data["latitude"], 12.9716)
        self.assertEqual(response.data["longitude"], 77.5946)

    def test_security_cannot_update_sos_fields(self):
        sos = SOS.objects.create(user=self.user, message="Need help", location="A", category="medical", status="OPEN")

        self.client.force_authenticate(user=self.security_user)
        response = self.client.patch(
            f"/api/sos/{sos.id}/",
            {"message": "Should not update"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

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

    def test_resident_can_add_message_to_their_own_sos(self):
        sos = SOS.objects.create(user=self.user, message="Need help", location="A", category="medical", status="OPEN")

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f"/api/sos/{sos.id}/message/",
            {"message": "Sending an update"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["message"], "Sending an update")
        self.assertEqual(response.data["sender"]["id"], self.user.id)
        self.assertTrue(SOSMessage.objects.filter(sos=sos, sender=self.user).exists())

    def test_resident_cannot_add_message_to_another_residents_sos(self):
        other_user = self.user_model.objects.create_user(
            username="resident2",
            email="resident2@example.com",
            password="testpass123",
            role="RESIDENT",
        )
        sos = SOS.objects.create(user=other_user, message="Other", location="B", category="fire", status="OPEN")

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f"/api/sos/{sos.id}/message/",
            {"message": "Not allowed"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(SOSMessage.objects.filter(sos=sos).exists())

    def test_security_and_admin_can_read_messages_for_any_sos_in_oldest_first_order(self):
        sos = SOS.objects.create(user=self.user, message="Need help", location="A", category="medical", status="OPEN")
        first_message = SOSMessage.objects.create(sos=sos, sender=self.user, message="First update")
        second_message = SOSMessage.objects.create(sos=sos, sender=self.security_user, message="Second update")

        self.client.force_authenticate(user=self.security_user)
        response = self.client.get(f"/api/sos/{sos.id}/messages/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["id"], first_message.id)
        self.assertEqual(response.data[1]["id"], second_message.id)
        self.assertEqual(response.data[0]["message"], "First update")
        self.assertEqual(response.data[1]["message"], "Second update")

