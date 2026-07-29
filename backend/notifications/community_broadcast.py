import logging
from typing import Dict, List, Optional

from django.contrib.auth import get_user_model
from django.db import models
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from django.conf import settings

from .models import CommunityBroadcastLog, Notification
from sos.models import SOS
from .radius_service import IncidentVisibilityRadiusService

logger = logging.getLogger(__name__)


class CommunityBroadcastService:
    def __init__(self, radius_filter=None, radius_service=None):
        self.radius_filter = radius_filter
        self.radius_service = radius_service or IncidentVisibilityRadiusService(
            default_radius_meters=getattr(settings, "COMMUNITY_BROADCAST_DEFAULT_RADIUS_METERS", 1000)
        )

    def _get_society(self, sos):
        try:
            profile = getattr(sos.user, "resident_profile", None)
            if profile is not None:
                society = getattr(profile, "society", None)
                if society is not None:
                    return society
        except Exception:
            return None
        return None

    def _is_active_user(self, user):
        if user is None:
            return False
        if not getattr(user, "is_active", True):
            return False
        return True

    def _has_notifications_enabled(self, user):
        return True

    def _matches_radius(self, sos, user, radius_meters=None):
        if self.radius_filter is not None:
            return self.radius_filter(sos, user)

        incident_latitude = getattr(sos, "latitude", None)
        incident_longitude = getattr(sos, "longitude", None)
        user_latitude = getattr(getattr(user, "volunteer_profile", None), "last_known_latitude", None)
        user_longitude = getattr(getattr(user, "volunteer_profile", None), "last_known_longitude", None)

        if any(value is None for value in (incident_latitude, incident_longitude, user_latitude, user_longitude)):
            logger.info(
                "Broadcast radius filter skipped for user %s because incident or user coordinates are missing",
                getattr(user, "id", None),
            )
            return True

        effective_radius = self.radius_service.get_effective_radius(radius_meters)
        inside, distance, radius_used, is_valid = self.radius_service.evaluate_candidate(
            incident_latitude,
            incident_longitude,
            user_latitude,
            user_longitude,
            effective_radius,
        )
        if not is_valid:
            logger.info(
                "Broadcast radius filter skipped for user %s because coordinates were invalid",
                getattr(user, "id", None),
            )
            return True

        logger.info(
            "Broadcast radius check for user %s: distance=%s radius=%s inside=%s",
            getattr(user, "id", None),
            distance,
            radius_used,
            inside,
        )
        return inside

    def get_recipients(self, sos, include_residents=False, broadcast_radius_meters=None):
        society = self._get_society(sos)
        User = get_user_model()
        recipients = []

        role_preferences = ["VOLUNTEER", "SECURITY"]
        if include_residents:
            role_preferences.append("RESIDENT")

        queryset = User.objects.filter(role__in=role_preferences, is_active=True)
        if society is not None:
            try:
                queryset = queryset.filter(
                    Q(role="RESIDENT", resident_profile__society=society)
                    | Q(role="VOLUNTEER", volunteer_profile__society=society)
                    | Q(role="VOLUNTEER", resident_profile__society=society)
                    | Q(role="SECURITY", security_profile__society=society)
                    | Q(role="SECURITY", resident_profile__society=society)
                )
            except Exception:
                queryset = queryset.filter(pk__in=[])

        by_role = {}
        for user in queryset.order_by("id"):
            if not self._is_active_user(user):
                continue
            if not self._has_notifications_enabled(user):
                continue
            if getattr(sos.user, "id", None) is not None and getattr(user, "id", None) == getattr(sos.user, "id", None):
                continue
            role = str(getattr(user, "role", "") or "").upper()
            volunteer_profile = getattr(user, "volunteer_profile", None)
            if role == "VOLUNTEER" and volunteer_profile is not None and not volunteer_profile.is_available:
                continue
            if role in {"VOLUNTEER", "SECURITY"}:
                inside_radius = self._matches_radius(sos, user, radius_meters=broadcast_radius_meters)
                if not inside_radius:
                    continue
            if role not in by_role:
                by_role[role] = user

        if include_residents:
            for role in ["VOLUNTEER", "SECURITY", "RESIDENT"]:
                user = by_role.get(role)
                if user is not None:
                    recipients.append(user)
        else:
            for role in ["VOLUNTEER", "SECURITY"]:
                user = by_role.get(role)
                if user is not None:
                    recipients.append(user)

        return recipients

    def _eligible_recipients(self, sos, include_residents=False, broadcast_radius_meters=None):
        return self.get_recipients(sos, include_residents=include_residents, broadcast_radius_meters=broadcast_radius_meters)

    def _build_summary(self, recipients):
        summary = {"volunteers": 0, "security": 0, "residents": 0}
        for recipient in recipients:
            role = str(getattr(recipient, "role", "") or "").upper()
            if role == "VOLUNTEER":
                summary["volunteers"] += 1
            elif role == "SECURITY":
                summary["security"] += 1
            elif role == "RESIDENT":
                summary["residents"] += 1
        return summary

    def _create_notification(self, sos, recipient, role):
        title = "Community Broadcast"
        body = f"A community broadcast has been sent for SOS {sos.id}."
        notification = Notification.objects.create(
            user=recipient,
            title=title,
            body=body,
            kind="SOS",
            data={
                "type": "COMMUNITY_BROADCAST",
                "alert_id": str(sos.id),
                "recipient_role": role,
                "broadcast": True,
            },
        )
        return notification

    def _log_delivery(self, sos, recipient, role, channel, delivery_status, recipient_contact=""):
        return CommunityBroadcastLog.objects.create(
            sos=sos,
            recipient=recipient,
            role=role,
            delivery_channel=channel,
            queued_at=timezone.now(),
            delivery_status=delivery_status,
            recipient_contact=recipient_contact,
        )

    def _enqueue_for_recipient(self, sos, recipient, role, notification):
        from . import tasks as notification_tasks

        phone_number = getattr(recipient, "phone", None) or ""
        email = getattr(recipient, "email", None) or ""
        device_tokens = []
        try:
            device_tokens = list(getattr(recipient, "device_tokens", []).all().values_list("token", flat=True))
        except Exception:
            device_tokens = []

        self._log_delivery(sos, recipient, role, "MULTI", "QUEUED", recipient_contact=phone_number or email)

        notification_tasks.send_push_notification_task.delay(
            device_tokens,
            "Community Broadcast",
            f"SOS {sos.id} requires nearby community support.",
            data={"notification_id": notification.id, "alert_id": str(sos.id)},
        )
        if phone_number:
            notification_tasks.send_sms_notification_task.delay([phone_number], f"Community broadcast for SOS {sos.id}.", notification_id=notification.id)
        if email:
            notification_tasks.send_email_notification_task.delay([email], "Community Broadcast", "notifications/sos_notification", {"notification_id": notification.id, "resident_name": sos.user.username if sos.user else "Resident"})

    @transaction.atomic
    def broadcast(self, sos_id, include_residents=False, broadcast_radius_meters=None):
        sos = SOS.objects.filter(pk=sos_id).first()
        if sos is None:
            raise SOS.DoesNotExist

        recipients = self._eligible_recipients(sos, include_residents=include_residents, broadcast_radius_meters=broadcast_radius_meters)
        summary = self._build_summary(recipients)

        if not recipients:
            return {
                "total_recipients": 0,
                "volunteers": 0,
                "security": 0,
                "residents": 0,
                "broadcast_started": True,
            }

        for recipient in recipients:
            role = str(getattr(recipient, "role", "") or "").upper()
            if CommunityBroadcastLog.objects.filter(sos=sos, recipient=recipient, role=role).exists():
                continue
            notification = self._create_notification(sos, recipient, role)
            self._enqueue_for_recipient(sos, recipient, role, notification)

        return {
            "total_recipients": len(recipients),
            "volunteers": summary["volunteers"],
            "security": summary["security"],
            "residents": summary["residents"],
            "broadcast_started": True,
        }
