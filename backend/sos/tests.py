import time
from datetime import timedelta
from unittest.mock import patch, Mock

from django.contrib.auth import get_user_model
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from notifications.models import Notification, NotificationDelivery, EscalationLog
from society.models import Society
from users.models import ResidentProfile
from .models import SOS, SOSMessage, SOSStatusEvent
from .serializers import SOSSerializer


class SOSStatusTrackingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.admin_user = self.user_model.objects.create_user(
            username="admin_status",
            email="admin_status@example.com",
            password="testpass123",
            role="ADMIN",
        )
        self.resident_user = self.user_model.objects.create_user(
            username="resident_status",
            email="resident_status@example.com",
            password="testpass123",
            role="RESIDENT",
        )
        self.other_resident = self.user_model.objects.create_user(
            username="resident_other",
            email="resident_other@example.com",
            password="testpass123",
            role="RESIDENT",
        )

    def test_sos_creation_creates_triggered_status_event(self):
        self.client.force_authenticate(user=self.resident_user)
        response = self.client.post(
            "/api/sos/trigger/",
            {"message": "Need help", "location": "Block 5", "category": "medical"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        sos = SOS.objects.get(pk=response.data["id"])
        self.assertTrue(SOSStatusEvent.objects.filter(sos=sos, status="TRIGGERED").exists())

    def test_status_transitions_are_preserved_in_history(self):
        sos = SOS.objects.create(user=self.resident_user, message="Need help", location="Block 5", category="medical")
        sos.record_status_event("GUARDIAN_NOTIFIED", details="Guardian notified")
        sos.record_status_event("GUARDIAN_RESPONDED", details="Guardian responded")
        sos.record_status_event("INCIDENT_CLOSED", details="Closed")

        events = list(sos.status_events.order_by("occurred_at", "id"))
        self.assertEqual([event.status for event in events], ["GUARDIAN_NOTIFIED", "GUARDIAN_RESPONDED", "INCIDENT_CLOSED"])
        self.assertEqual(events[0].details, "Guardian notified")
        self.assertEqual(sos.get_current_lifecycle_status(), "INCIDENT_CLOSED")

    def test_status_detail_endpoint_returns_current_status_and_timeline(self):
        sos = SOS.objects.create(user=self.resident_user, message="Need help", location="Block 5", category="medical")
        sos.record_status_event("GUARDIAN_NOTIFIED", details="Guardian notified")
        sos.record_status_event("SECURITY_RESPONDED", details="Security responded")

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(f"/api/sos/{sos.id}/status/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["current_status"], "SECURITY_RESPONDED")
        self.assertEqual(len(response.data["timeline"]), 2)
        self.assertIn("occurred_at", response.data["timeline"][0])

    def test_resident_can_only_view_their_own_status(self):
        other_sos = SOS.objects.create(user=self.other_resident, message="Other", location="Block 2", category="fire")
        self.client.force_authenticate(user=self.resident_user)

        response = self.client.get(f"/api/sos/{other_sos.id}/status/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_sos_detail_endpoint_returns_single_incident_for_authenticated_users(self):
        sos = SOS.objects.create(user=self.resident_user, message="Need help", location="Block 5", category="medical")
        sos.record_status_event("TRIGGERED", details="Triggered")

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(f"/api/sos/{sos.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], sos.id)

    def test_volunteer_accept_action_records_volunteer_status_event(self):
        volunteer_user = self.user_model.objects.create_user(
            username="volunteer_accept",
            email="volunteer_accept@example.com",
            password="testpass123",
            role="VOLUNTEER",
        )
        sos = SOS.objects.create(user=self.resident_user, message="Need help", location="Block 6", category="medical")

        self.client.force_authenticate(user=volunteer_user)
        response = self.client.patch(f"/api/sos/{sos.id}/", {"action": "accept"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(SOSStatusEvent.objects.filter(sos=sos, status="VOLUNTEER_ACCEPTED").exists())

    def test_status_list_supports_search_filter_ordering_and_pagination(self):
        society = "Lakeview"
        first_sos = SOS.objects.create(user=self.resident_user, message="Need help", location="Block 1", category="medical")
        first_sos.record_status_event("TRIGGERED")
        first_sos.record_status_event("GUARDIAN_NOTIFIED")

        second_sos = SOS.objects.create(user=self.other_resident, message="Second incident", location="Block 2", category="fire")
        second_sos.record_status_event("TRIGGERED")

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(
            "/api/sos/status-list/?search=incident&status=TRIGGERED&ordering=-created_at&page=1&page_size=1"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["incident_id"], second_sos.id)


class SOSResponseMonitoringTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.admin_user = self.user_model.objects.create_user(
            username="admin_monitor",
            email="admin_monitor@example.com",
            password="testpass123",
            role="ADMIN",
        )
        self.resident_user = self.user_model.objects.create_user(
            username="resident_monitor",
            email="resident_monitor@example.com",
            password="testpass123",
            role="RESIDENT",
        )
        self.other_resident = self.user_model.objects.create_user(
            username="resident_other_monitor",
            email="resident_other_monitor@example.com",
            password="testpass123",
            role="RESIDENT",
        )

    def test_response_monitoring_calculates_durations_and_stage(self):
        base_time = timezone.now() - timedelta(hours=2)
        sos = SOS.objects.create(user=self.resident_user, message="Need help", location="Block 5", category="medical")
        sos.created_at = base_time
        sos.save(update_fields=["created_at"])

        sos.record_status_event("TRIGGERED", details="Triggered", occurred_at=base_time)
        sos.record_status_event("GUARDIAN_RESPONDED", details="Guardian responded", occurred_at=base_time + timedelta(minutes=10))
        sos.record_status_event("VOLUNTEER_ACCEPTED", details="Volunteer accepted", occurred_at=base_time + timedelta(minutes=20))
        sos.record_status_event("SECURITY_RESPONDED", details="Security responded", occurred_at=base_time + timedelta(minutes=30))
        sos.record_status_event("INCIDENT_CLOSED", details="Closed", occurred_at=base_time + timedelta(minutes=40))

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(f"/api/sos/response-monitor/{sos.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["current_stage"], "Closed")
        self.assertEqual(response.data["response_durations"]["guardian_response_time_seconds"], 600)
        self.assertEqual(response.data["response_durations"]["volunteer_response_time_seconds"], 1200)
        self.assertEqual(response.data["response_durations"]["security_response_time_seconds"], 1800)
        self.assertEqual(response.data["response_durations"]["total_resolution_time_seconds"], 2400)

    def test_response_monitoring_lists_active_and_closed_incidents_with_filters(self):
        base_time = timezone.now() - timedelta(hours=2)
        active_sos = SOS.objects.create(user=self.resident_user, message="Active incident", location="Block 1", category="medical")
        active_sos.created_at = base_time
        active_sos.save(update_fields=["created_at"])
        active_sos.record_status_event("TRIGGERED", occurred_at=base_time)
        active_sos.record_status_event("GUARDIAN_NOTIFIED", occurred_at=base_time + timedelta(minutes=5))

        closed_sos = SOS.objects.create(user=self.other_resident, message="Closed incident", location="Block 2", category="fire")
        closed_sos.created_at = base_time
        closed_sos.save(update_fields=["created_at"])
        closed_sos.record_status_event("TRIGGERED", occurred_at=base_time)
        closed_sos.record_status_event("INCIDENT_CLOSED", occurred_at=base_time + timedelta(minutes=15))

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(
            "/api/sos/response-monitor/?current_stage=Waiting%20for%20Guardian&active=true&ordering=-created_at&page=1&page_size=1"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["incident_id"], active_sos.id)

    def test_response_monitoring_respects_resident_permissions(self):
        sos = SOS.objects.create(user=self.other_resident, message="Other incident", location="Block 3", category="security")
        self.client.force_authenticate(user=self.resident_user)

        response = self.client.get(f"/api/sos/response-monitor/{sos.id}/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_response_monitoring_supports_search_filter_and_pagination(self):
        base_time = timezone.now() - timedelta(hours=1)
        sos = SOS.objects.create(user=self.resident_user, message="Searchable incident", location="Block 9", category="medical")
        sos.created_at = base_time
        sos.save(update_fields=["created_at"])
        sos.record_status_event("TRIGGERED", occurred_at=base_time)
        sos.record_status_event("GUARDIAN_NOTIFIED", occurred_at=base_time + timedelta(minutes=3))

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(
            "/api/sos/response-monitor/?search=searchable&incident_type=medical&ordering=-created_at&page=1&page_size=1"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["incident_id"], sos.id)


class SOSDashboardAggregationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.admin_user = self.user_model.objects.create_user(
            username="admin_dashboard",
            email="admin_dashboard@example.com",
            password="testpass123",
            role="ADMIN",
        )
        self.resident_user = self.user_model.objects.create_user(
            username="resident_dashboard",
            email="resident_dashboard@example.com",
            password="testpass123",
            role="RESIDENT",
        )
        self.society = Society.objects.create(
            name="Lakeview Society",
            address="1 Main Road",
            city="Bengaluru",
            state="KA",
            pincode="560001",
        )

    def test_dashboard_overview_returns_empty_state_when_no_data(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/api/sos/dashboard/overview/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["overview"]["total_incidents"], 0)
        self.assertEqual(response.data["overview"]["active_incidents"], 0)
        self.assertEqual(response.data["overview"]["resolved_incidents"], 0)
        self.assertEqual(response.data["overview"]["pending_notifications"], 0)
        self.assertEqual(response.data["overview"]["failed_deliveries"], 0)
        self.assertEqual(response.data["overview"]["active_societies"], 0)

    def test_dashboard_overview_aggregates_incidents_and_notifications(self):
        ResidentProfile.objects.create(user=self.resident_user, society=self.society, block=None, flat=None)

        active_sos = SOS.objects.create(user=self.resident_user, message="Active alert", location="Block 1", category="medical")
        active_sos.record_status_event("TRIGGERED")
        active_sos.record_status_event("GUARDIAN_NOTIFIED")

        resolved_sos = SOS.objects.create(user=self.resident_user, message="Resolved alert", location="Block 2", category="fire")
        resolved_sos.record_status_event("TRIGGERED")
        resolved_sos.record_status_event("INCIDENT_CLOSED")

        notification = Notification.objects.create(user=self.resident_user, title="Test alert", body="Need attention", kind="SOS", read=False)
        NotificationDelivery.objects.create(notification=notification, channel="Email", recipient="admin@example.com", status="Sent")
        NotificationDelivery.objects.create(notification=notification, channel="SMS", recipient="+919999999999", status="Failed")

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/api/sos/dashboard/overview/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["overview"]["total_incidents"], 2)
        self.assertEqual(response.data["overview"]["active_incidents"], 1)
        self.assertEqual(response.data["overview"]["resolved_incidents"], 1)
        self.assertEqual(response.data["overview"]["pending_notifications"], 1)
        self.assertEqual(response.data["overview"]["failed_deliveries"], 1)
        self.assertEqual(response.data["overview"]["active_societies"], 1)

    def test_dashboard_recent_activity_supports_pagination(self):
        first_sos = SOS.objects.create(user=self.resident_user, message="First alert", location="Block 1", category="medical")
        first_sos.record_status_event("TRIGGERED")
        second_sos = SOS.objects.create(user=self.resident_user, message="Second alert", location="Block 2", category="fire")
        second_sos.record_status_event("TRIGGERED")

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/api/sos/dashboard/recent-activity/?page=1&page_size=1")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["type"], "SOS")

    def test_dashboard_requires_admin_access(self):
        self.client.force_authenticate(user=self.resident_user)
        response = self.client.get("/api/sos/dashboard/overview/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


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

    @patch("sos.views.send_sms_notification_task.delay")
    @patch("sos.views.send_email_notification_task.delay")
    @patch("sos.views.send_push_notification_task.delay")
    def test_sos_push_notifications_are_targeted_per_recipient(self, mock_push_delay, mock_email_delay, mock_sms_delay):
        self.client.force_authenticate(user=self.user)
        self.user.device_token = "resident-token"
        self.user.save(update_fields=["device_token"])

        admin_user = self.user_model.objects.create_user(
            username="admin_push",
            email="admin_push@example.com",
            password="testpass123",
            role="ADMIN",
        )
        admin_user.device_token = "admin-token"
        admin_user.save(update_fields=["device_token"])

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
        self.assertTrue(any(call.args[0] == ["resident-token"] for call in mock_push_delay.call_args_list))
        self.assertTrue(any(call.args[0] == ["admin-token"] for call in mock_push_delay.call_args_list))

    @patch("sos.views.send_sms_notification_task.delay")
    @patch("sos.views.send_email_notification_task.delay")
    @patch("sos.views.send_push_notification_task.delay")
    def test_sos_routes_to_guardian_security_and_volunteer_recipients_only(self, mock_push_delay, mock_email_delay, mock_sms_delay):
        self.client.force_authenticate(user=self.user)

        guardian_user = self.user_model.objects.create_user(
            username="guardian_route",
            email="guardian_route@example.com",
            password="testpass123",
            role="GUARDIAN",
        )
        volunteer_user = self.user_model.objects.create_user(
            username="volunteer_route",
            email="volunteer_route@example.com",
            password="testpass123",
            role="VOLUNTEER",
        )

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
        self.assertEqual(Notification.objects.filter(kind="SOS", user=self.user).count(), 1)
        self.assertEqual(Notification.objects.filter(kind="SOS", user=guardian_user).count(), 1)
        self.assertEqual(Notification.objects.filter(kind="SOS", user=self.security_user).count(), 1)
        self.assertEqual(Notification.objects.filter(kind="SOS", user=volunteer_user).count(), 1)
        self.assertEqual(Notification.objects.filter(kind="SOS", user=self.admin_user).count(), 1)
        self.assertEqual(Notification.objects.filter(kind="SOS").count(), 5)

    def test_sos_routing_deduplicates_overlapping_role_recipients(self):
        self.client.force_authenticate(user=self.user)
        self.security_user.device_token = "security-token"
        self.security_user.save(update_fields=["device_token"])

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
        self.assertEqual(Notification.objects.filter(kind="SOS", user=self.security_user).count(), 1)
        self.assertEqual(Notification.objects.filter(kind="SOS", user=self.admin_user).count(), 1)

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

    def test_resident_can_attach_audio_to_their_sos_message(self):
        sos = SOS.objects.create(user=self.user, message="Need help", location="A", category="medical", status="OPEN")
        audio_file = SimpleUploadedFile(
            "voice-note.m4a",
            b"fake-audio-data",
            content_type="audio/m4a",
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f"/api/sos/{sos.id}/message/",
            {"message": "", "audio": audio_file},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(SOSMessage.objects.filter(sos=sos).exists())
        message = SOSMessage.objects.get(sos=sos)
        self.assertTrue(message.audio_file)
        self.assertIn("audio_url", response.data)

    @patch("sos.views.transcription_module.transcribe_audio", return_value="Test transcript")
    def test_whisper_transcribes_audio_for_authenticated_user(self, mock_transcribe):
        audio_file = SimpleUploadedFile(
            "voice-note.m4a",
            b"fake-audio-data",
            content_type="audio/m4a",
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/sos/transcribe/",
            {"audio": audio_file},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["success"], True)
        self.assertEqual(response.data["transcript"], "Test transcript")
        mock_transcribe.assert_called_once()

    @patch("sos.views.transcription_module.transcribe_audio", side_effect=RuntimeError("transcription failed"))
    def test_sos_transcription_endpoint_returns_failure_when_whisper_transcription_fails(self, mock_transcribe):
        audio_file = SimpleUploadedFile(
            "voice-note.m4a",
            b"fake-audio-data",
            content_type="audio/m4a",
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/sos/transcribe/",
            {"audio": audio_file},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(response.data["success"], False)
        self.assertEqual(response.data["message"], "Unable to transcribe audio.")
        mock_transcribe.assert_called_once()

    def test_sos_creation_succeeds_even_if_email_fails(self):
        # Ensure that if email sending fails, SOS creation still returns 200
        self.client.force_authenticate(user=self.user)
        with patch('notifications.services.NotificationService.send_email_notification', side_effect=Exception('Email failure')):
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
        self.assertTrue(SOS.objects.filter(user=self.user).exists())

    def test_sos_creation_succeeds_even_if_sms_fails(self):
        # Ensure that if SMS sending fails, SOS creation still returns 200
        self.client.force_authenticate(user=self.user)
        with patch('notifications.services.NotificationService.send_sms_notification', side_effect=Exception('SMS failure')):
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
        self.assertTrue(SOS.objects.filter(user=self.user).exists())

    def test_whisper_rejects_empty_audio_file(self):
        audio_file = SimpleUploadedFile(
            "voice-note.wav",
            b"",
            content_type="audio/wav",
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/sos/transcribe/",
            {"audio": audio_file},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["success"], False)
        self.assertIn("The submitted file is empty.", str(response.data["errors"]))

    @patch("sos.transcription.transcribe_audio", return_value="Help is needed immediately")
    def test_transcription_is_stored_for_audio_messages(self, _mock_transcribe):
        sos = SOS.objects.create(user=self.user, message="Need help", location="A", category="medical", status="OPEN")
        audio_file = SimpleUploadedFile(
            "voice-note.m4a",
            b"fake-audio-data",
            content_type="audio/m4a",
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f"/api/sos/{sos.id}/message/",
            {"message": "", "audio": audio_file},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        message = SOSMessage.objects.get(sos=sos)

        for _ in range(20):
            message.refresh_from_db()
            if message.transcription_status == "COMPLETED":
                break
            time.sleep(0.05)

        self.assertEqual(message.transcription_status, "COMPLETED")
        self.assertEqual(message.transcript, "Help is needed immediately")
        self.assertIsNotNone(message.transcription_completed_at)

    @patch("sos.transcription.transcribe_audio", side_effect=RuntimeError("transcription failed"))
    def test_transcription_failure_keeps_audio_upload_successful(self, _mock_transcribe):
        sos = SOS.objects.create(user=self.user, message="Need help", location="A", category="medical", status="OPEN")
        audio_file = SimpleUploadedFile(
            "voice-note.m4a",
            b"fake-audio-data",
            content_type="audio/m4a",
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f"/api/sos/{sos.id}/message/",
            {"message": "", "audio": audio_file},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        message = SOSMessage.objects.get(sos=sos)

        for _ in range(20):
            message.refresh_from_db()
            if message.transcription_status == "FAILED":
                break
            time.sleep(0.05)

        self.assertEqual(message.transcription_status, "FAILED")
        self.assertEqual(message.transcript, "")

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

