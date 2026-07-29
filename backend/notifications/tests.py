from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from sos.models import SOS
from society.models import Society
from users.models import EmergencyContact, GuardianProfile, ResidentProfile, VolunteerProfile
from .models import DeviceToken, Notification, NotificationDelivery, EscalationConfiguration, EscalationLog, CommunityBroadcastLog
from .tasks import (
    process_guardian_escalation_task,
    process_community_broadcast_task,
    send_email_notification_task,
    send_push_notification_task,
    send_sms_notification_task,
)
from .community_broadcast import CommunityBroadcastService
from .radius_service import IncidentVisibilityRadiusService
from .firebase import send_push_notification


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

    def test_unregister_device_token_removes_user_device_token_and_record(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/notifications/register-device/",
            {"device_token": "android-token-123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.device_token, "android-token-123")
        self.assertTrue(DeviceToken.objects.filter(user=self.user, token="android-token-123").exists())

        response = self.client.delete(
            "/api/notifications/register-device/",
            {"token": "android-token-123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["success"], True)
        self.user.refresh_from_db()
        self.assertEqual(self.user.device_token, "")
        self.assertFalse(DeviceToken.objects.filter(user=self.user, token="android-token-123").exists())

    def test_register_device_token_reassigns_existing_token_to_current_user(self):
        other_user = self.user_model.objects.create_user(
            username="admin_token",
            email="admin_token@example.com",
            password="testpass123",
            role="ADMIN",
        )
        other_user.device_token = "shared-token-123"
        other_user.save(update_fields=["device_token"])
        DeviceToken.objects.create(user=other_user, token="shared-token-123", platform="android", device_id="device-1")

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/notifications/register-device/",
            {"device_token": "shared-token-123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        other_user.refresh_from_db()
        self.assertEqual(self.user.device_token, "shared-token-123")
        self.assertEqual(other_user.device_token, "")
        self.assertTrue(DeviceToken.objects.filter(user=self.user, token="shared-token-123").exists())
        self.assertFalse(DeviceToken.objects.filter(user=other_user, token="shared-token-123").exists())

    def test_register_device_reuses_existing_registration_for_same_device(self):
        DeviceToken.objects.create(user=self.user, token="old-token", platform="android", device_id="device-1")

        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/notifications/register-device/",
            {"device_token": "new-token", "device_id": "device-1", "platform": "android"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(DeviceToken.objects.filter(user=self.user, device_id="device-1").count(), 1)
        self.assertEqual(DeviceToken.objects.get(user=self.user, device_id="device-1").token, "new-token")

    @patch("notifications.firebase.initialize_firebase")
    @patch("firebase_admin.messaging.send")
    def test_send_push_notification_removes_invalid_registration_token(self, mock_send, mock_initialize):
        DeviceToken.objects.create(user=self.user, token="invalid-token", platform="android", device_id="device-1")
        self.user.device_token = "invalid-token"
        self.user.save(update_fields=["device_token"])

        mock_send.side_effect = Exception("messaging/registration-token-not-registered")

        result = send_push_notification("invalid-token", "title", "body", {"id": 1})

        self.assertIsNone(result)
        self.assertFalse(DeviceToken.objects.filter(token="invalid-token").exists())
        self.user.refresh_from_db()
        self.assertEqual(self.user.device_token, "")


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

    def test_list_notifications_supports_unread_filter(self):
        Notification.objects.create(user=self.user, title="SOS alert", body="Emergency", kind="SOS", read=False)
        Notification.objects.create(user=self.user, title="Welcome", body="Hello", kind="ANNOUNCEMENT", read=True)

        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/notifications/notifications/", {"unread_only": "1"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["title"], "SOS alert")

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

    def test_push_task_handles_missing_notification_record_without_crashing(self):
        with patch("notifications.tasks.NotificationService.send_push_notification", return_value=False):
            result = send_push_notification_task(
                ["device-token-123"],
                "Emergency SOS Alert",
                "Emergency",
                data={"notification_id": 999999},
            )

        self.assertFalse(result)


class NotificationDeliveryTrackingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.admin_user = self.user_model.objects.create_user(
            username="admin_delivery",
            email="admin_delivery@example.com",
            password="testpass123",
            role="ADMIN",
        )
        self.resident_user = self.user_model.objects.create_user(
            username="resident_delivery",
            email="resident_delivery@example.com",
            password="testpass123",
            role="RESIDENT",
        )

    def test_successful_delivery_tracking_sets_sent_status(self):
        notification = Notification.objects.create(user=self.resident_user, title="SOS alert", body="Emergency", kind="SOS", read=False)

        with patch("notifications.tasks.NotificationService.send_email_notification", return_value=True):
            send_email_notification_task(
                ["admin@example.com"],
                "SOS Alert",
                "notifications/sos_notification",
                context={"notification_id": notification.id},
            )

        delivery = notification.deliveries.get(channel="Email")
        self.assertEqual(delivery.status, "Sent")
        self.assertEqual(delivery.notification_type, "SOS")
        self.assertEqual(delivery.recipient_role, "RESIDENT")
        self.assertIsNotNone(delivery.sent_at)

    def test_failed_delivery_tracking_sets_failure_reason_and_retry_count(self):
        notification = Notification.objects.create(user=self.resident_user, title="SOS alert", body="Emergency", kind="SOS", read=False)

        with patch("notifications.tasks.NotificationService.send_sms_notification", return_value=False):
            send_sms_notification_task(["+919999999999"], "Emergency", notification_id=notification.id)

        delivery = notification.deliveries.get(channel="SMS")
        self.assertEqual(delivery.status, "Failed")
        self.assertTrue(delivery.failure_reason)
        self.assertEqual(delivery.retry_count, 1)

    def test_retry_count_increments_on_repeated_failures(self):
        notification = Notification.objects.create(user=self.resident_user, title="SOS alert", body="Emergency", kind="SOS", read=False)

        with patch("notifications.tasks.NotificationService.send_sms_notification", return_value=False):
            send_sms_notification_task(["+919999999999"], "Emergency", notification_id=notification.id)
            send_sms_notification_task(["+919999999999"], "Emergency", notification_id=notification.id)

        delivery = notification.deliveries.get(channel="SMS")
        self.assertEqual(delivery.retry_count, 2)

    def test_delivery_status_api_supports_filters_search_ordering_and_pagination(self):
        first_notification = Notification.objects.create(user=self.resident_user, title="SOS alert", body="Emergency", kind="SOS", read=False)
        second_notification = Notification.objects.create(user=self.resident_user, title="Reminder", body="Please review", kind="ANNOUNCEMENT", read=False)

        NotificationDelivery.objects.create(
            notification=first_notification,
            channel="Email",
            recipient="admin@example.com",
            recipient_role="RESIDENT",
            notification_type="SOS",
            status="Sent",
            retry_count=0,
            recipient_address="admin@example.com",
        )
        NotificationDelivery.objects.create(
            notification=second_notification,
            channel="SMS",
            recipient="+919999999999",
            recipient_role="RESIDENT",
            notification_type="ANNOUNCEMENT",
            status="Sent",
            retry_count=0,
            recipient_address="+919999999999",
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(
            "/api/notifications/delivery-status/?channel=Email&status=Sent&notification_type=SOS&recipient_role=RESIDENT&search=admin&ordering=-created_at&page=1&page_size=1"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["recipient"], "admin@example.com")

    def test_delivery_status_api_respects_resident_permissions(self):
        notification = Notification.objects.create(user=self.resident_user, title="SOS alert", body="Emergency", kind="SOS", read=False)
        NotificationDelivery.objects.create(
            notification=notification,
            channel="Email",
            recipient="resident@example.com",
            recipient_role="RESIDENT",
            notification_type="SOS",
            status="Sent",
            retry_count=0,
            recipient_address="resident@example.com",
        )

        self.client.force_authenticate(user=self.resident_user)
        response = self.client.get("/api/notifications/delivery-status/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["recipient"], "resident@example.com")


class CommunityBroadcastTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.resident_user = self.user_model.objects.create_user(
            username="resident_broadcast",
            email="resident_broadcast@example.com",
            password="testpass123",
            role="RESIDENT",
        )
        self.society = Society.objects.create(
            name="Broadcast Society",
            address="1 Broadcast Street",
            city="Test City",
            state="TS",
            pincode="123456",
        )
        self.resident_profile = ResidentProfile.objects.create(
            user=self.resident_user,
            society=self.society,
            block=None,
            flat=None,
        )
        self.sos = SOS.objects.create(user=self.resident_user, status="ACTIVE", message="Community broadcast")

    def test_no_recipients_returns_empty_summary(self):
        self.client.force_authenticate(user=self.resident_user)
        response = self.client.post("/api/notifications/community-broadcast/", {"sos_id": self.sos.id}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_recipients"], 0)
        self.assertEqual(response.data["volunteers"], 0)
        self.assertEqual(response.data["security"], 0)
        self.assertEqual(response.data["residents"], 0)
        self.assertTrue(response.data["broadcast_started"])

    def test_broadcast_endpoint_returns_volunteers_only(self):
        volunteer_user = self.user_model.objects.create_user(
            username="volunteer_broadcast_only",
            email="volunteer_broadcast_only@example.com",
            password="testpass123",
            role="VOLUNTEER",
        )
        ResidentProfile.objects.create(user=volunteer_user, society=self.society, block=None, flat=None)

        self.client.force_authenticate(user=self.resident_user)
        response = self.client.post("/api/notifications/community-broadcast/", {"sos_id": self.sos.id}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["volunteers"], 1)
        self.assertEqual(response.data["total_recipients"], 1)

    def test_broadcast_endpoint_returns_security_only(self):
        security_user = self.user_model.objects.create_user(
            username="security_broadcast_only",
            email="security_broadcast_only@example.com",
            password="testpass123",
            role="SECURITY",
        )
        ResidentProfile.objects.create(user=security_user, society=self.society, block=None, flat=None)

        self.client.force_authenticate(user=self.resident_user)
        response = self.client.post("/api/notifications/community-broadcast/", {"sos_id": self.sos.id}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["security"], 1)
        self.assertEqual(response.data["total_recipients"], 1)

    def test_broadcast_endpoint_supports_mixed_recipients(self):
        volunteer_user = self.user_model.objects.create_user(
            username="volunteer_broadcast_mixed",
            email="volunteer_broadcast_mixed@example.com",
            password="testpass123",
            role="VOLUNTEER",
        )
        security_user = self.user_model.objects.create_user(
            username="security_broadcast_mixed",
            email="security_broadcast_mixed@example.com",
            password="testpass123",
            role="SECURITY",
        )
        resident_recipient = self.user_model.objects.create_user(
            username="resident_recipient_mixed",
            email="resident_recipient_mixed@example.com",
            password="testpass123",
            role="RESIDENT",
        )
        ResidentProfile.objects.create(user=volunteer_user, society=self.society, block=None, flat=None)
        ResidentProfile.objects.create(user=security_user, society=self.society, block=None, flat=None)
        ResidentProfile.objects.create(user=resident_recipient, society=self.society, block=None, flat=None)

        self.client.force_authenticate(user=self.resident_user)
        response = self.client.post(
            "/api/notifications/community-broadcast/",
            {"sos_id": self.sos.id, "include_residents": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["volunteers"], 1)
        self.assertEqual(response.data["security"], 1)
        self.assertEqual(response.data["residents"], 1)
        self.assertEqual(response.data["total_recipients"], 3)

    def test_broadcast_endpoint_rejects_invalid_sos(self):
        self.client.force_authenticate(user=self.resident_user)
        response = self.client.post("/api/notifications/community-broadcast/", {"sos_id": 9999}, format="json")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch("notifications.views.process_community_broadcast_task.delay")
    def test_broadcast_endpoint_queues_celery_task(self, mock_delay):
        self.client.force_authenticate(user=self.resident_user)
        response = self.client.post("/api/notifications/community-broadcast/", {"sos_id": self.sos.id}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_delay.assert_called_once()

    @patch("notifications.tasks.send_email_notification_task.delay")
    @patch("notifications.tasks.send_sms_notification_task.delay")
    @patch("notifications.tasks.send_push_notification_task.delay")
    def test_duplicate_broadcast_prevention(self, mock_push, mock_sms, mock_email):
        volunteer_user = self.user_model.objects.create_user(
            username="volunteer_broadcast_duplicate",
            email="volunteer_broadcast_duplicate@example.com",
            password="testpass123",
            role="VOLUNTEER",
        )
        security_user = self.user_model.objects.create_user(
            username="security_broadcast_duplicate",
            email="security_broadcast_duplicate@example.com",
            password="testpass123",
            role="SECURITY",
        )
        resident_recipient = self.user_model.objects.create_user(
            username="resident_recipient_duplicate",
            email="resident_recipient_duplicate@example.com",
            password="testpass123",
            role="RESIDENT",
        )
        ResidentProfile.objects.create(user=volunteer_user, society=self.society, block=None, flat=None)
        ResidentProfile.objects.create(user=security_user, society=self.society, block=None, flat=None)
        ResidentProfile.objects.create(user=resident_recipient, society=self.society, block=None, flat=None)

        service = CommunityBroadcastService()
        service.broadcast(self.sos.id, include_residents=True)
        service.broadcast(self.sos.id, include_residents=True)

        self.assertEqual(CommunityBroadcastLog.objects.filter(sos=self.sos).count(), 3)
        self.assertEqual(mock_push.call_count, 3)
        self.assertEqual(mock_sms.call_count, 0)
        self.assertEqual(mock_email.call_count, 3)


class IncidentVisibilityRadiusTests(TestCase):
    def setUp(self):
        self.service = IncidentVisibilityRadiusService(default_radius_meters=1000)

    def test_user_inside_radius(self):
        inside, distance, radius, is_valid = self.service.evaluate_candidate(12.0, 77.0, 12.0005, 77.0, 1000)
        self.assertTrue(inside)
        self.assertTrue(is_valid)
        self.assertLessEqual(distance, radius)

    def test_user_outside_radius(self):
        inside, distance, radius, is_valid = self.service.evaluate_candidate(12.0, 77.0, 12.01, 77.0, 1000)
        self.assertFalse(inside)
        self.assertTrue(is_valid)
        self.assertGreater(distance, radius)

    def test_boundary_condition(self):
        inside, _, _, _ = self.service.evaluate_candidate(12.0, 77.0, 12.008983, 77.0, 1000)
        self.assertTrue(inside)

    def test_missing_coordinates_are_rejected(self):
        inside, distance, radius, is_valid = self.service.evaluate_candidate(12.0, 77.0, None, 77.0, 1000)
        self.assertFalse(inside)
        self.assertIsNone(distance)
        self.assertEqual(radius, 1000)
        self.assertFalse(is_valid)

    def test_zero_radius(self):
        inside, _, _, _ = self.service.evaluate_candidate(12.0, 77.0, 13.0, 77.0, 0)
        self.assertFalse(inside)

    def test_default_radius_is_used_when_omitted(self):
        radius = self.service.get_effective_radius(None)
        self.assertEqual(radius, 1000)


class VolunteerAvailabilityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.volunteer_user = self.user_model.objects.create_user(
            username="volunteer_availability",
            email="volunteer_availability@example.com",
            password="testpass123",
            role="VOLUNTEER",
        )
        self.volunteer_profile = VolunteerProfile.objects.create(
            user=self.volunteer_user,
            skills="first aid",
            availability="available",
        )
        self.resident_user = self.user_model.objects.create_user(
            username="resident_availability",
            email="resident_availability@example.com",
            password="testpass123",
            role="RESIDENT",
        )
        self.sos = SOS.objects.create(user=self.resident_user, status="ACTIVE", message="Broadcast")

    def test_volunteer_can_go_online(self):
        self.client.force_authenticate(user=self.volunteer_user)
        response = self.client.put(
            "/api/volunteers/availability/",
            {"is_available": True, "last_known_latitude": 12.34, "last_known_longitude": 56.78},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.volunteer_profile.refresh_from_db()
        self.assertTrue(self.volunteer_profile.is_available)
        self.assertEqual(self.volunteer_profile.last_known_latitude, 12.34)
        self.assertEqual(self.volunteer_profile.last_known_longitude, 56.78)
        self.assertTrue(response.data["is_available"])

    def test_volunteer_can_go_offline(self):
        self.client.force_authenticate(user=self.volunteer_user)
        response = self.client.put(
            "/api/volunteers/availability/",
            {"is_available": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.volunteer_profile.refresh_from_db()
        self.assertFalse(self.volunteer_profile.is_available)

    def test_non_volunteer_cannot_update_availability(self):
        self.client.force_authenticate(user=self.resident_user)
        response = self.client.put(
            "/api/volunteers/availability/",
            {"is_available": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_invalid_coordinates_are_rejected(self):
        self.client.force_authenticate(user=self.volunteer_user)
        response = self.client.put(
            "/api/volunteers/availability/",
            {"is_available": True, "last_known_latitude": 91.0, "last_known_longitude": 56.78},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_broadcast_ignores_unavailable_volunteers(self):
        available_volunteer = self.user_model.objects.create_user(
            username="available_volunteer",
            email="available_volunteer@example.com",
            password="testpass123",
            role="VOLUNTEER",
        )
        unavailable_volunteer = self.user_model.objects.create_user(
            username="unavailable_volunteer",
            email="unavailable_volunteer@example.com",
            password="testpass123",
            role="VOLUNTEER",
        )
        VolunteerProfile.objects.create(user=available_volunteer, skills="first aid", availability="available", is_available=True)
        VolunteerProfile.objects.create(user=unavailable_volunteer, skills="first aid", availability="available", is_available=False)

        service = CommunityBroadcastService()
        recipients = service.get_recipients(self.sos, include_residents=False)

        self.assertEqual(len(recipients), 1)
        self.assertEqual(recipients[0].id, available_volunteer.id)


class GuardianEscalationTaskTests(TestCase):
    def setUp(self):
        self.user_model = get_user_model()
        self.resident_user = self.user_model.objects.create_user(
            username="resident_escalation",
            email="resident_escalation@example.com",
            password="testpass123",
            role="RESIDENT",
        )
        self.resident_profile = ResidentProfile.objects.create(
            user=self.resident_user,
            society=None,
            block=None,
            flat=None,
        )
        self.secondary_guardian_user = self.user_model.objects.create_user(
            username="secondary_guardian",
            email="secondary_guardian@example.com",
            password="testpass123",
            role="GUARDIAN",
        )
        GuardianProfile.objects.create(
            user=self.secondary_guardian_user,
            resident_name=self.resident_user.username,
            relationship="Father",
        )
        self.emergency_contact = EmergencyContact.objects.create(
            resident=self.resident_profile,
            name="Emergency Contact",
            phone="+919999999999",
            relationship="Friend",
            contact_type=EmergencyContact.ContactType.EMERGENCY_CONTACT,
            is_verified=True,
        )
        self.config = EscalationConfiguration.objects.create(
            response_timeout_minutes=5,
            escalation_enabled=True,
            escalate_to_secondary_guardian=True,
            escalate_to_emergency_contacts=True,
        )

    def _create_sos(self, **kwargs):
        defaults = {
            "user": self.resident_user,
            "status": "ACTIVE",
        }
        defaults.update(kwargs)
        sos = SOS.objects.create(**defaults)
        if "created_at" not in kwargs:
            SOS.objects.filter(pk=sos.pk).update(created_at=timezone.now() - timedelta(minutes=6))
            sos.refresh_from_db()
        return sos

    @patch("notifications.tasks.send_email_notification_task.delay")
    @patch("notifications.tasks.send_sms_notification_task.delay")
    @patch("notifications.tasks.send_push_notification_task.delay")
    def test_timeout_not_reached_does_not_escalate(self, mock_push, mock_sms, mock_email):
        self._create_sos(created_at=timezone.now() - timedelta(minutes=2))

        process_guardian_escalation_task()

        mock_push.assert_not_called()
        mock_sms.assert_not_called()
        mock_email.assert_not_called()

    @patch("notifications.tasks.send_email_notification_task.delay")
    @patch("notifications.tasks.send_sms_notification_task.delay")
    @patch("notifications.tasks.send_push_notification_task.delay")
    def test_timeout_reached_escalates_to_secondary_guardian(self, mock_push, mock_sms, mock_email):
        sos = self._create_sos()

        process_guardian_escalation_task()

        sos.refresh_from_db()
        self.assertEqual(sos.status, "ESCALATED")
        self.assertEqual(sos.escalation_level, 1)
        mock_push.assert_called_once()
        mock_sms.assert_called_once()
        mock_email.assert_called_once()

    @patch("notifications.tasks.send_email_notification_task.delay")
    @patch("notifications.tasks.send_sms_notification_task.delay")
    @patch("notifications.tasks.send_push_notification_task.delay")
    def test_escalation_disabled_does_not_escalate(self, mock_push, mock_sms, mock_email):
        self.config.escalation_enabled = False
        self.config.save(update_fields=["escalation_enabled"])
        self._create_sos()

        process_guardian_escalation_task()

        mock_push.assert_not_called()
        mock_sms.assert_not_called()
        mock_email.assert_not_called()

    @patch("notifications.tasks.send_email_notification_task.delay")
    @patch("notifications.tasks.send_sms_notification_task.delay")
    @patch("notifications.tasks.send_push_notification_task.delay")
    def test_already_escalated_alert_is_not_reprocessed(self, mock_push, mock_sms, mock_email):
        self._create_sos(status="ESCALATED", escalation_level=1)

        process_guardian_escalation_task()

        mock_push.assert_not_called()
        mock_sms.assert_not_called()
        mock_email.assert_not_called()

    @patch("notifications.tasks.send_email_notification_task.delay")
    @patch("notifications.tasks.send_sms_notification_task.delay")
    @patch("notifications.tasks.send_push_notification_task.delay")
    def test_no_secondary_guardian_escalates_to_emergency_contacts(self, mock_push, mock_sms, mock_email):
        self.secondary_guardian_user.delete()
        sos = self._create_sos()

        process_guardian_escalation_task()

        sos.refresh_from_db()
        self.assertEqual(sos.status, "ESCALATED")
        self.assertEqual(sos.escalation_level, 2)
        mock_push.assert_called_once()
        mock_sms.assert_called_once()
        mock_email.assert_called_once()

    @patch("notifications.tasks.send_email_notification_task.delay")
    @patch("notifications.tasks.send_sms_notification_task.delay")
    @patch("notifications.tasks.send_push_notification_task.delay")
    def test_emergency_contact_escalation_is_used_when_secondary_is_already_done(self, mock_push, mock_sms, mock_email):
        sos = self._create_sos(escalation_level=1)

        process_guardian_escalation_task()

        sos.refresh_from_db()
        self.assertEqual(sos.status, "ESCALATED")
        self.assertEqual(sos.escalation_level, 2)
        mock_push.assert_called_once()
        mock_sms.assert_called_once()
        mock_email.assert_called_once()

    @patch("notifications.tasks.send_email_notification_task.delay")
    @patch("notifications.tasks.send_sms_notification_task.delay")
    @patch("notifications.tasks.send_push_notification_task.delay")
    def test_duplicate_celery_execution_does_not_escalate_twice(self, mock_push, mock_sms, mock_email):
        sos = self._create_sos()

        process_guardian_escalation_task()
        process_guardian_escalation_task()

        sos.refresh_from_db()
        self.assertEqual(sos.escalation_level, 1)
        self.assertEqual(mock_push.call_count, 1)
        self.assertEqual(mock_sms.call_count, 1)
        self.assertEqual(mock_email.call_count, 1)


class EscalationLogApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.admin_user = self.user_model.objects.create_user(
            username="admin_logs",
            email="admin_logs@example.com",
            password="testpass123",
            role="ADMIN",
        )
        self.resident_user = self.user_model.objects.create_user(
            username="resident_logs",
            email="resident_logs@example.com",
            password="testpass123",
            role="RESIDENT",
        )
        self.config = EscalationConfiguration.objects.create(
            response_timeout_minutes=5,
            escalation_enabled=True,
            escalate_to_secondary_guardian=True,
            escalate_to_emergency_contacts=True,
        )
        self.resident_profile = ResidentProfile.objects.create(
            user=self.resident_user,
            society=None,
            block=None,
            flat=None,
        )
        self.secondary_guardian_user = self.user_model.objects.create_user(
            username="secondary_guardian_logs",
            email="secondary_guardian_logs@example.com",
            password="testpass123",
            role="GUARDIAN",
        )
        GuardianProfile.objects.create(
            user=self.secondary_guardian_user,
            resident_name=self.resident_user.username,
            relationship="Father",
        )
        EmergencyContact.objects.create(
            resident=self.resident_profile,
            name="Emergency Contact",
            phone="+919999999999",
            relationship="Friend",
            contact_type=EmergencyContact.ContactType.EMERGENCY_CONTACT,
            is_verified=True,
        )

    def _create_expired_sos(self, **kwargs):
        defaults = {"user": self.resident_user, "status": "ACTIVE"}
        defaults.update(kwargs)
        sos = SOS.objects.create(**defaults)
        if "created_at" not in kwargs:
            SOS.objects.filter(pk=sos.pk).update(created_at=timezone.now() - timedelta(minutes=6))
            sos.refresh_from_db()
        return sos

    @patch("notifications.tasks.send_email_notification_task.delay")
    @patch("notifications.tasks.send_sms_notification_task.delay")
    @patch("notifications.tasks.send_push_notification_task.delay")
    def test_log_creation_and_duplicate_prevention(self, mock_push, mock_sms, mock_email):
        sos = self._create_expired_sos()

        process_guardian_escalation_task()
        process_guardian_escalation_task()

        logs = EscalationLog.objects.filter(sos=sos)
        self.assertEqual(logs.count(), 1)
        self.assertEqual(logs.get().status, "SENT")
        self.assertEqual(logs.get().escalation_level, EscalationLog.EscalationLevel.SECONDARY_GUARDIAN)
        self.assertEqual(mock_push.call_count, 1)
        self.assertEqual(mock_sms.call_count, 1)
        self.assertEqual(mock_email.call_count, 1)

    def test_list_endpoint_returns_newest_first_and_supports_filters(self):
        self.client.force_authenticate(user=self.admin_user)
        first_sos = self._create_expired_sos()
        second_sos = self._create_expired_sos()
        EscalationLog.objects.create(
            sos=first_sos,
            escalation_level=EscalationLog.EscalationLevel.SECONDARY_GUARDIAN,
            recipient_user=self.secondary_guardian_user,
            escalation_reason="timeout",
            response_timeout_minutes=5,
            status="SENT",
        )
        EscalationLog.objects.create(
            sos=second_sos,
            escalation_level=EscalationLog.EscalationLevel.EMERGENCY_CONTACT,
            recipient_user=self.resident_user,
            recipient_contact="+919999999999",
            escalation_reason="fallback",
            response_timeout_minutes=5,
            status="FAILED",
        )

        response = self.client.get(
            "/api/notifications/escalation-logs/",
            {
                "sos": first_sos.id,
                "escalation_level": EscalationLog.EscalationLevel.SECONDARY_GUARDIAN,
                "status": "SENT",
                "date": first_sos.created_at.date().strftime("%Y-%m-%d"),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["sos"], first_sos.id)

    def test_detail_endpoint_returns_full_history(self):
        self.client.force_authenticate(user=self.admin_user)
        sos = self._create_expired_sos()
        log = EscalationLog.objects.create(
            sos=sos,
            escalation_level=EscalationLog.EscalationLevel.EMERGENCY_CONTACT,
            recipient_user=self.resident_user,
            recipient_contact="+919999999999",
            escalation_reason="fallback",
            response_timeout_minutes=5,
            status="SENT",
        )

        response = self.client.get(f"/api/notifications/escalation-logs/{log.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], log.id)
        self.assertEqual(response.data["sos"], sos.id)
        self.assertEqual(response.data["recipient_contact"], "+919999999999")

    def test_pagination_and_unauthorized_access(self):
        self.client.force_authenticate(user=self.admin_user)
        for index in range(3):
            sos = self._create_expired_sos()
            EscalationLog.objects.create(
                sos=sos,
                escalation_level=EscalationLog.EscalationLevel.SECONDARY_GUARDIAN,
                recipient_user=self.secondary_guardian_user,
                escalation_reason="timeout",
                response_timeout_minutes=5,
                status="SENT",
            )

        response = self.client.get("/api/notifications/escalation-logs/?page=1&page_size=2")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 2)

        self.client.force_authenticate(user=self.resident_user)
        response = self.client.get("/api/notifications/escalation-logs/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class EscalationConfigurationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.admin_user = self.user_model.objects.create_user(
            username="admin_escalation",
            email="admin_escalation@example.com",
            password="testpass123",
            role="ADMIN",
        )
        self.resident_user = self.user_model.objects.create_user(
            username="resident_escalation",
            email="resident_escalation@example.com",
            password="testpass123",
            role="RESIDENT",
        )

    def test_retrieve_configuration_creates_default_config(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.get("/api/notifications/escalation-config/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(EscalationConfiguration.objects.exists())
        self.assertEqual(response.data["response_timeout_minutes"], 5)
        self.assertTrue(response.data["escalation_enabled"])

    def test_update_configuration(self):
        config = EscalationConfiguration.objects.create(response_timeout_minutes=10, escalation_enabled=False)

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.put(
            "/api/notifications/escalation-config/",
            {
                "response_timeout_minutes": 12,
                "escalation_enabled": True,
                "escalate_to_secondary_guardian": False,
                "escalate_to_emergency_contacts": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        config.refresh_from_db()
        self.assertEqual(config.response_timeout_minutes, 12)
        self.assertTrue(config.escalation_enabled)
        self.assertFalse(config.escalate_to_secondary_guardian)
        self.assertFalse(config.escalate_to_emergency_contacts)

    def test_non_admin_cannot_access_configuration(self):
        self.client.force_authenticate(user=self.resident_user)

        response = self.client.get("/api/notifications/escalation-config/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_validation_rejects_invalid_timeout(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.put(
            "/api/notifications/escalation-config/",
            {"response_timeout_minutes": 0},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("response_timeout_minutes", response.data)
