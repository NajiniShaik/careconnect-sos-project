import logging
import re
from typing import List

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.db import models, transaction
from django.db.models import Q
# render not used
from django.contrib.auth import get_user_model
from django.core.paginator import Paginator
from django.http import HttpResponse
from django.utils import timezone
from django.utils.html import escape
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from django.db.models import Count
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.filters import SearchFilter
from rest_framework.pagination import PageNumberPagination

from .serializers import (
    SOSSerializer,
    SOSStatusUpdateSerializer,
    SOSResidentUpdateSerializer,
    SOSMessageCreateSerializer,
    SOSMessageSerializer,
    SpeechToTextSerializer,
    SOSStatusDetailSerializer,
    SOSStatusListItemSerializer,
    SOSResponseMonitoringSerializer,
    ChatMessageSerializer,
    ResponseUpdateSerializer,
)
from .models import SOS, SOSMessage, SOSStatusEvent, ChatMessage, ResponseUpdate
from . import transcription as transcription_module
from .transcription import enqueue_transcription
from .utils import reverse_geocode_coordinates
from users.permissions import IsAdmin, IsAdminOrSecurity, IsResident, IsSecurity
from users.models import GuardianProfile
from notifications.models import DeviceToken, Notification, NotificationDelivery
from notifications.tasks import send_push_notification_task, send_email_notification_task, send_sms_notification_task, process_community_broadcast_task
from notifications.community_broadcast import CommunityBroadcastService
from society.models import Society

logger = logging.getLogger(__name__)


class DashboardPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


class UpdatesPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 200


def _get_dashboard_sos_queryset(user):
    queryset = SOS.objects.select_related("user")
    if getattr(user, "role", None) == "SECURITY":
        security_profile = getattr(user, "security_profile", None)
        society = getattr(security_profile, "society", None)
        if society is None:
            return queryset.none()
        return queryset.filter(user__resident_profile__society=society)
    if getattr(user, "role", None) == "ADMIN":
        return queryset.all()
    return queryset.none()


def _get_security_scope_society(user):
    security_profile = getattr(user, "security_profile", None)
    return getattr(security_profile, "society", None)


def _is_security_incident_in_scope(sos, user):
    society = _get_security_scope_society(user)
    if society is None:
        return True

    resident_profile = getattr(getattr(sos, "user", None), "resident_profile", None)
    return getattr(resident_profile, "society_id", None) == getattr(society, "id", None)


def _summarize_security_dashboard_queryset(queryset):
    summary = {
        "total_incidents": queryset.count(),
        "active_incidents": 0,
        "escalated_incidents": 0,
        "resolved_incidents": 0,
    }

    for sos in queryset:
        current_status = sos.get_current_lifecycle_status()
        status_field = str(getattr(sos, "status", "") or "").upper()
        if current_status == "INCIDENT_CLOSED" or status_field in {"RESOLVED", "CLOSED"}:
            summary["resolved_incidents"] += 1
        else:
            summary["active_incidents"] += 1
            if status_field == "ESCALATED" or current_status == "AUTO_ESCALATED":
                summary["escalated_incidents"] += 1

    return summary


class DashboardOverviewView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrSecurity]

    def get(self, request):
        sos_queryset = _get_dashboard_sos_queryset(request.user)

        active_incidents = 0
        resolved_incidents = 0
        for sos in sos_queryset:
            current_status = sos.get_current_lifecycle_status()
            status_field = str(getattr(sos, "status", "") or "").upper()
            if current_status == "INCIDENT_CLOSED" or status_field in {"RESOLVED", "CLOSED"}:
                resolved_incidents += 1
            else:
                active_incidents += 1

        active_societies = (
            sos_queryset.filter(user__resident_profile__society__isnull=False)
            .values_list("user__resident_profile__society__id", flat=True)
            .distinct()
            .count()
        )

        overview = {
            "total_incidents": sos_queryset.count(),
            "active_incidents": active_incidents,
            "resolved_incidents": resolved_incidents,
            "pending_notifications": Notification.objects.filter(read=False).count(),
            "failed_deliveries": NotificationDelivery.objects.filter(status="Failed").count(),
            "active_societies": active_societies,
        }
        return Response({"overview": overview}, status=status.HTTP_200_OK)


class DashboardRecentActivityView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrSecurity]
    pagination_class = DashboardPagination

    def get(self, request):
        sos_queryset = _get_dashboard_sos_queryset(request.user)
        activities = []
        for sos in sos_queryset.order_by("-created_at", "-id"):
            current_status = sos.get_current_lifecycle_status()
            status_label = "Resolved" if current_status == "INCIDENT_CLOSED" else "Active"
            activities.append(
                {
                    "id": sos.id,
                    "type": "SOS",
                    "title": "SOS Incident",
                    "description": sos.message or "SOS alert triggered",
                    "actor": getattr(sos.user, "username", None),
                    "status": status_label,
                    "created_at": sos.created_at.isoformat() if getattr(sos, "created_at", None) else None,
                }
            )

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(activities, request, view=self)
        return paginator.get_paginated_response(page)


class SecurityDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrSecurity]

    def get(self, request):
        sos_queryset = _get_dashboard_sos_queryset(request.user)

        summary = _summarize_security_dashboard_queryset(sos_queryset)
        summary["active_societies"] = (
            sos_queryset.filter(user__resident_profile__society__isnull=False)
            .values_list("user__resident_profile__society__id", flat=True)
            .distinct()
            .count()
        )

        recent_activity = []
        active_incidents = []

        for sos in sos_queryset.order_by("-created_at", "-id"):
            current_status = sos.get_current_lifecycle_status()
            status_field = str(getattr(sos, "status", "") or "").upper()
            recent_activity.append(
                {
                    "id": sos.id,
                    "type": "SOS",
                    "title": "SOS Incident",
                    "description": sos.message or "SOS alert triggered",
                    "actor": getattr(sos.user, "username", None),
                    "status": "Resolved" if current_status == "INCIDENT_CLOSED" else "Active",
                    "created_at": sos.created_at.isoformat() if getattr(sos, "created_at", None) else None,
                }
            )

            if current_status != "INCIDENT_CLOSED" and status_field not in {"RESOLVED", "CLOSED"}:
                society = None
                resident_profile = getattr(sos.user, "resident_profile", None)
                if resident_profile is not None:
                    society = getattr(resident_profile, "society", None)
                active_incidents.append(
                    {
                        "id": sos.id,
                        "title": sos.message or "SOS alert",
                        "priority": sos.priority or "Medium",
                        "status": status_field or "ACTIVE",
                        "society": getattr(society, "name", None),
                        "created_at": sos.created_at.isoformat() if getattr(sos, "created_at", None) else None,
                    }
                )

        recent_activity = recent_activity[:10]
        active_incidents = active_incidents[:5]

        return Response(
            {
                "summary": summary,
                "recent_activity": recent_activity,
                "active_incidents": active_incidents,
            },
            status=status.HTTP_200_OK,
        )


class SecurityIncidentCoordinationView(APIView):
    permission_classes = [IsAuthenticated, IsSecurity]

    def get(self, request, pk):
        try:
            sos = _get_dashboard_sos_queryset(request.user).get(pk=pk)
        except SOS.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        resident_profile = getattr(getattr(sos.user, "resident_profile", None), "society", None)
        society = {
            "id": getattr(resident_profile, "id", None),
            "name": getattr(resident_profile, "name", None),
        }

        latest_update = ResponseUpdate.objects.filter(incident=sos).order_by("-created_at", "-id").first()
        latest_update_data = None
        if latest_update is not None:
            latest_update_data = {
                "id": latest_update.id,
                "message": latest_update.message,
                "role": latest_update.role,
                "update_type": latest_update.update_type,
                "created_at": latest_update.created_at.isoformat() if getattr(latest_update, "created_at", None) else None,
            }

        payload = {
            "id": sos.id,
            "message": sos.message,
            "location": sos.location,
            "category": sos.category,
            "priority": sos.priority,
            "status": sos.status,
            "current_status": sos.get_current_lifecycle_status(),
            "created_at": sos.created_at.isoformat() if getattr(sos, "created_at", None) else None,
            "updated_at": sos.updated_at.isoformat() if getattr(sos, "updated_at", None) else None,
            "society": society,
            "incident_owner": getattr(sos.user, "username", None),
            "assigned_volunteer": getattr(sos.assigned_volunteer, "username", None),
            "coordination": {
                "status": sos.status,
                "incident_owner": getattr(sos.user, "username", None),
                "assigned_volunteer": getattr(sos.assigned_volunteer, "username", None),
                "priority": sos.priority,
                "latest_update": latest_update_data,
                "updated_at": sos.updated_at.isoformat() if getattr(sos, "updated_at", None) else None,
            },
        }
        return Response(payload, status=status.HTTP_200_OK)


class SecurityReportingSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsSecurity]

    def get(self, request):
        queryset = _get_dashboard_sos_queryset(request.user)
        summary = _summarize_security_dashboard_queryset(queryset)
        society = _get_security_scope_society(request.user)
        payload = {
            "summary": summary,
            "society": {
                "id": getattr(society, "id", None),
                "name": getattr(society, "name", None),
            },
        }
        return Response(payload, status=status.HTTP_200_OK)


def _normalize_phone_number(phone_number):
    if not phone_number:
        return None

    value = str(phone_number).strip()
    if not value:
        return None

    if value.startswith("+"):
        normalized = "+" + re.sub(r"[^\d]", "", value[1:])
    else:
        normalized = re.sub(r"\D", "", value)

    if not normalized:
        return None

    if normalized.startswith("+"):
        return normalized if 8 <= len(normalized) <= 16 else None

    if normalized.startswith("0") and len(normalized) == 11:
        normalized = normalized[1:]

    if len(normalized) == 10:
        return f"+91{normalized}"
    if len(normalized) == 12 and normalized.startswith("91"):
        return f"+{normalized}"
    if 7 <= len(normalized) <= 15:
        return f"+{normalized}"

    return None


def _get_society_admin_queryset(user_model, society_name):
    queryset = user_model.objects.filter(role__in=["ADMIN", "SECURITY"])
    if society_name:
        society_queryset = queryset.filter(resident_profile__society__name=society_name)
        if society_queryset.exists():
            return society_queryset
    return queryset


def _get_fallback_email_recipients():
    recipient = getattr(settings, "EMAIL_HOST_USER", None) or getattr(settings, "DEFAULT_FROM_EMAIL", None)
    return [recipient] if recipient else []


def _get_user_device_tokens(user):
    if not user:
        return []

    tokens = []
    if getattr(user, "device_token", None):
        user_token = str(user.device_token).strip()
        if user_token:
            tokens.append(user_token)

    try:
        record_tokens = list(DeviceToken.objects.filter(user=user).values_list("token", flat=True))
    except Exception:
        record_tokens = []

    for token in record_tokens or []:
        token_value = str(token).strip() if token is not None else ""
        if token_value and token_value not in tokens:
            tokens.append(token_value)

    return tokens


def _is_user_available_for_sos_role(user):
    role = str(getattr(user, "role", "") or "").upper()
    if role == "VOLUNTEER":
        volunteer_profile = getattr(user, "volunteer_profile", None)
        return volunteer_profile is None or bool(getattr(volunteer_profile, "is_available", False))
    if role == "SECURITY":
        security_profile = getattr(user, "security_profile", None)
        return security_profile is None or bool(getattr(security_profile, "is_available", False))
    return True


def _get_linked_guardians_for_resident(resident_user):
    if resident_user is None:
        return []

    User = get_user_model()
    resident_username = str(getattr(resident_user, "username", "") or "").strip().lower()
    resident_full_name = str(getattr(resident_user, "get_full_name", lambda: "")() or "").strip().lower()
    resident_email = str(getattr(resident_user, "email", "") or "").strip().lower()

    try:
        guardian_profiles = GuardianProfile.objects.select_related("user").all()
    except Exception:
        return []

    linked_guardians = []
    for profile in guardian_profiles:
        guardian_user = getattr(profile, "user", None)
        if guardian_user is None or guardian_user.id == getattr(resident_user, "id", None):
            continue

        resident_name_value = str(getattr(profile, "resident_name", "") or "").strip().lower()
        if not resident_name_value:
            continue

        if resident_name_value in {resident_username, resident_full_name, resident_email}:
            linked_guardians.append(guardian_user)

    return linked_guardians


def _get_sos_recipients(resident_user, society_name):
    recipients = [resident_user]
    User = get_user_model()

    try:
        linked_guardians = _get_linked_guardians_for_resident(resident_user)
        recipients.extend([guardian for guardian in linked_guardians if guardian and guardian.id != getattr(resident_user, "id", None)])
    except Exception:
        linked_guardians = []

    try:
        security_users = list(User.objects.filter(role="SECURITY"))
        recipients.extend([
            security_user
            for security_user in security_users
            if security_user
            and security_user.id != getattr(resident_user, "id", None)
            and _is_user_available_for_sos_role(security_user)
        ])
    except Exception:
        security_users = []

    try:
        volunteer_users = list(User.objects.filter(role="VOLUNTEER"))
        recipients.extend([
            volunteer_user
            for volunteer_user in volunteer_users
            if volunteer_user
            and volunteer_user.id != getattr(resident_user, "id", None)
            and _is_user_available_for_sos_role(volunteer_user)
        ])
    except Exception:
        volunteer_users = []

    try:
        admin_qs = _get_society_admin_queryset(User, society_name)
        recipients.extend([
            admin_user
            for admin_user in admin_qs
            if admin_user
            and admin_user.id != getattr(resident_user, "id", None)
            and (
                str(getattr(admin_user, "role", "") or "").upper() != "SECURITY"
                or _is_user_available_for_sos_role(admin_user)
            )
        ])
    except Exception:
        admin_qs = []

    unique_recipients = []
    seen_ids = set()
    for recipient in recipients:
        if not recipient:
            continue
        recipient_id = getattr(recipient, "id", None)
        if recipient_id in seen_ids:
            continue
        seen_ids.add(recipient_id)
        unique_recipients.append(recipient)
    return unique_recipients


class SOSCategoriesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        categories = [
            {"value": "medical", "label": "Medical", "description": "Medical assistance needed"},
            {"value": "fire", "label": "Fire", "description": "Fire or smoke emergency"},
            {"value": "security", "label": "Security", "description": "Security or intrusion concern"},
            {"value": "power", "label": "Power", "description": "Power outage or electrical issue"},
            {"value": "other", "label": "Other", "description": "Other urgent assistance"},
        ]

        return Response({"categories": categories})


class CreateSOSView(APIView):
    permission_classes = [IsAuthenticated & IsResident]

    def post(self, request):
        message = request.data.get("message", "")
        location = request.data.get("location", "")
        category = request.data.get("category") or request.data.get("category_name") or ""
        latitude = request.data.get("latitude")
        longitude = request.data.get("longitude")
        priority = request.data.get("priority")

        latitude_value = float(latitude) if latitude not in [None, "", " "] else None
        longitude_value = float(longitude) if longitude not in [None, "", " "] else None

        geocode_payload = reverse_geocode_coordinates(latitude_value, longitude_value) or {}
        resolved_location = geocode_payload.get("location") or location or ""

        normalized_priority = None
        if isinstance(priority, str):
            normalized_priority = priority.upper()
        elif priority is None:
            normalized_priority = "HIGH"

        if normalized_priority not in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}:
            normalized_priority = "HIGH"

        sos = SOS.objects.create(
            user=request.user,
            message=message,
            location=resolved_location if resolved_location else location,
            category=category,
            latitude=latitude_value,
            longitude=longitude_value,
            address=geocode_payload.get("address") or None,
            city=geocode_payload.get("city") or None,
            state=geocode_payload.get("state") or None,
            country=geocode_payload.get("country") or None,
            status="OPEN",
            priority=normalized_priority,
        )
        sos.record_status_event("TRIGGERED", details="SOS incident triggered")

        # Trigger notifications (best-effort). Do not let notification
        # failures affect the core SOS creation flow.
        try:
            User = get_user_model()

            resident_name = getattr(request.user, "get_full_name", None)
            try:
                resident_name = request.user.get_full_name() or request.user.username
            except Exception:
                resident_name = getattr(request.user, "username", "Resident")

            society_name = ""
            try:
                profile = getattr(request.user, "resident_profile", None)
                if profile and getattr(profile, "society", None):
                    society_name = profile.society.name
            except Exception:
                society_name = ""

            context = {
                "resident_name": resident_name,
                "society_name": society_name,
                "category": sos.category,
                "severity": sos.priority,
                "address": sos.address or sos.location or "",
                "timestamp": sos.created_at.isoformat() if getattr(sos, "created_at", None) else "",
                "message": sos.message or "",
            }

            # Email recipients: admins and security users for the society (best-effort)
            admin_qs = _get_society_admin_queryset(User, society_name)
            admin_emails = [u.email for u in admin_qs if getattr(u, "email", None)]

            # SMS recipients: admins/security plus emergency contacts
            sms_numbers = []
            try:
                sms_numbers.extend(
                    normalized
                    for normalized in (
                        _normalize_phone_number(u.phone)
                        for u in admin_qs
                        if getattr(u, "phone", None)
                    )
                    if normalized
                )
            except Exception:
                pass

            try:
                profile = getattr(request.user, "resident_profile", None)
                if profile:
                    for ec in getattr(profile, "emergency_contacts", []).all():
                        normalized_number = _normalize_phone_number(getattr(ec, "phone", None))
                        if normalized_number:
                            sms_numbers.append(normalized_number)
            except Exception:
                pass

            sms_numbers = [num for num in set(sms_numbers) if num]

            # Fire off notifications (best-effort) via Celery. Failures should not break SOS creation.
            try:
                recipient_users = _get_sos_recipients(request.user, society_name)
                recipients_to_notify = []
                seen_recipient_ids = set()
                for recipient in recipient_users:
                    recipient_id = getattr(recipient, "id", None)
                    if recipient_id is None or recipient_id in seen_recipient_ids:
                        continue
                    seen_recipient_ids.add(recipient_id)
                    recipients_to_notify.append(recipient)
                logger.info("[SOS] routing recipients=%s resident=%s society=%s", [getattr(user, "username", "") for user in recipients_to_notify], getattr(request.user, "username", ""), society_name)
                notification_body = f"{resident_name} has triggered an SOS."
                created_notifications = []
                created_notification_ids = []
                for recipient in recipients_to_notify:
                    notification = Notification.objects.create(
                        user=recipient,
                        title="Emergency SOS Alert",
                        body=notification_body,
                        kind="SOS",
                        data={
                            "type": "SOS",
                            "alert_id": str(sos.id),
                            "resident_id": str(request.user.id),
                            "target": f"/alerts?alert_id={sos.id}",
                        },
                    )
                    created_notifications.append((recipient, notification))
                    created_notification_ids.append(notification.id)

                primary_notification_id = created_notifications[0][1].id if created_notifications else None

                if sms_numbers:
                    logger.info("[SOS] channels=SMS recipients=%s", sms_numbers)
                    block_name = ""
                    flat_name = ""
                    try:
                        profile = getattr(request.user, "resident_profile", None)
                        if profile and getattr(profile, "block", None):
                            block_name = profile.block.name or ""
                        if profile and getattr(profile, "flat", None):
                            flat_name = getattr(profile.flat, "flat_number", "")
                    except Exception:
                        block_name = ""
                        flat_name = ""

                    coords = ""
                    if sos.latitude is not None and sos.longitude is not None:
                        coords = f" https://www.google.com/maps/search/?api=1&query={sos.latitude},{sos.longitude}"

                    sms_message = (
                        f"Emergency SOS Alert. Resident: {resident_name}. Society: {society_name or 'N/A'}. "
                        f"Block: {block_name or 'N/A'}. Flat: {flat_name or 'N/A'}. "
                        f"Emergency Type: {sos.category or 'SOS'}. Time: {context['timestamp']}."
                    )
                    if coords:
                        sms_message += f" Location:{coords}"
                    if len(sms_message) > 320:
                        sms_message = sms_message[:317] + "..."

                    logger.info("QUEUE SMS")
                    send_sms_notification_task.delay(sms_numbers, sms_message, notification_id=primary_notification_id)

                email_recipients = admin_emails or _get_fallback_email_recipients()
                if email_recipients:
                    logger.info("[SOS] channels=Email recipients=%s", email_recipients)
                    logger.info("QUEUE EMAIL")
                    send_email_notification_task.delay(
                        email_recipients,
                        "SOS Alert: %s" % (sos.category or "SOS"),
                        "notifications/sos_notification",
                        {**context, "notification_id": primary_notification_id},
                    )
                else:
                    logger.warning("No email recipients available for SOS alert; skipping admin email task")

                for recipient, notification in created_notifications:
                    device_tokens = _get_user_device_tokens(recipient)
                    if not device_tokens:
                        logger.info("[SOS] No device tokens available for recipient=%s role=%s", getattr(recipient, "username", ""), getattr(recipient, "role", ""))
                        continue

                    logger.info("[SOS] channels=Push recipient=%s role=%s token_count=%s", getattr(recipient, "username", ""), getattr(recipient, "role", ""), len(device_tokens))
                    push_data = {
                        "type": "SOS",
                        "alert_id": str(sos.id),
                        "resident_id": str(request.user.id),
                        "notification_id": notification.id,
                    }
                    logger.info(
                        "[SOS DEBUG] queue_push recipient=%s role=%s tokens=%s title=%s body=%s data=%s",
                        getattr(recipient, "username", ""),
                        getattr(recipient, "role", ""),
                        device_tokens,
                        "Emergency SOS Alert",
                        f"{resident_name} has triggered an SOS.",
                        push_data,
                    )
                    send_push_notification_task.delay(
                        device_tokens,
                        "Emergency SOS Alert",
                        f"{resident_name} has triggered an SOS.",
                        data=push_data,
                    )

                # Enqueue community broadcast using the existing notifications pipeline.
                process_community_broadcast_task.delay(sos.id, include_residents=False, broadcast_radius_meters=None)
            except Exception:
                logger.exception("Failed to queue SOS notifications")

            # Also send emails to emergency contacts if they have an email address.
            try:
                contact_emails = []
                try:
                    profile = getattr(request.user, "resident_profile", None)
                    if profile:
                        for ec in getattr(profile, "emergency_contacts", []).all():
                            email = getattr(ec, "email", None) or getattr(ec, "contact_email", None)
                            if email:
                                contact_emails.append(email)
                except Exception:
                    contact_emails = []

                if contact_emails:
                    try:
                        logger.info("Queued Email notification task")
                        for notification_id in created_notification_ids:
                            send_email_notification_task.delay(
                                contact_emails,
                                "Emergency SOS Alert",
                                "notifications/emergency_contact_notification",
                                {**context, "contact_name": "Emergency Contact", "notification_id": notification_id},
                            )
                    except Exception:
                        logger.exception("Failed to queue SOS emails to emergency contacts")
            except Exception:
                # Ensure any email-related errors do not interrupt SOS creation
                logger.exception("Unexpected error while sending emergency contact emails")
        except Exception:
            # Ensure notifications cannot break the primary flow
            logger.exception("Unexpected error while triggering notifications")

        return Response({
            "id": sos.id,
            "status": sos.status,
            "message": "SOS triggered successfully",
            "category": sos.category,
            "latitude": sos.latitude,
            "longitude": sos.longitude,
            "address": sos.address,
            "city": sos.city,
            "state": sos.state,
            "country": sos.country,
            "location": sos.location,
            "priority": sos.priority,
        }, status=status.HTTP_200_OK)
    
    def get(self, request):
        sos_list = SOS.objects.filter(user=request.user).order_by("-created_at")

        serializer = SOSSerializer(sos_list, many=True, context={"request": request})

        return Response(serializer.data)


class SOSMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            sos = SOS.objects.get(pk=pk)
        except SOS.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        user = request.user
        logger.warning(
            "SOSMessageView.get debug: user_id=%s username=%s role=%s sos_id=%s",
            getattr(user, "id", None),
            getattr(user, "username", None),
            getattr(user, "role", None),
            getattr(sos, "id", None),
        )

        can_view = _can_view_sos_messages(sos, user)
        logger.warning("SOSMessageView.get debug: can_view_messages=%s", can_view)

        if not can_view:
            return Response(status=status.HTTP_403_FORBIDDEN)

        messages = SOSMessage.objects.filter(sos=sos).order_by("created_at", "id")
        serializer = SOSMessageSerializer(messages, many=True, context={"request": request})
        return Response(serializer.data)

    def post(self, request, pk):
        try:
            sos = SOS.objects.get(pk=pk)
        except SOS.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if request.user.role == "RESIDENT" and sos.user_id != request.user.id:
            return Response(status=status.HTTP_403_FORBIDDEN)

        if request.user.role not in ["RESIDENT", "SECURITY", "ADMIN"]:
            return Response(status=status.HTTP_403_FORBIDDEN)

        serializer = SOSMessageCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        audio_file = serializer.validated_data.get("audio")
        transcription_status = "PENDING" if audio_file else "NOT_REQUIRED"

        message = SOSMessage.objects.create(
            sos=sos,
            sender=request.user,
            message=serializer.validated_data.get("message", "") or "",
            audio_file=audio_file,
            transcription_status=transcription_status,
        )

        if audio_file:
            sos.transcript = ""
            sos.transcription_status = "PENDING"
            sos.transcription_completed_at = None
            sos.save(update_fields=["transcript", "transcription_status", "transcription_completed_at"])
            enqueue_transcription(message, message.audio_file.path, transcribe_func=transcription_module.transcribe_audio)

        output_serializer = SOSMessageSerializer(message, context={"request": request})
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class SOSRetryTranscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            sos = SOS.objects.get(pk=pk)
        except SOS.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if request.user.role == "RESIDENT" and sos.user_id != request.user.id:
            return Response(status=status.HTTP_403_FORBIDDEN)

        if request.user.role not in ["RESIDENT", "SECURITY", "ADMIN"]:
            return Response(status=status.HTTP_403_FORBIDDEN)

        latest_audio_message = sos.messages.filter(audio_file__isnull=False).order_by("-created_at", "-id").first()
        if not latest_audio_message:
            return Response({"detail": "No audio attachment found"}, status=status.HTTP_404_NOT_FOUND)

        latest_audio_message.transcript = ""
        latest_audio_message.transcription_status = "PENDING"
        latest_audio_message.transcription_completed_at = None
        latest_audio_message.save(update_fields=["transcript", "transcription_status", "transcription_completed_at"])

        sos.transcript = ""
        sos.transcription_status = "PENDING"
        sos.transcription_completed_at = None
        sos.save(update_fields=["transcript", "transcription_status", "transcription_completed_at"])

        enqueue_transcription(latest_audio_message, latest_audio_message.audio_file.path, transcribe_func=transcription_module.transcribe_audio)
        return Response(SOSMessageSerializer(latest_audio_message, context={"request": request}).data, status=status.HTTP_200_OK)


class AudioTranscriptionView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = SpeechToTextSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"success": False, "message": "Invalid audio upload.", "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        audio_file = serializer.validated_data["audio"]

        try:
            transcript = self._transcribe_audio(audio_file)
            return Response({"success": True, "transcript": transcript}, status=status.HTTP_200_OK)
        except ValueError as exc:
            return Response({"success": False, "message": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response(
                {"success": False, "message": "Unable to transcribe audio."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _transcribe_audio(self, audio_file):
        audio_bytes = audio_file.read()
        if not audio_bytes:
            raise ValueError("Uploaded audio file is empty.")

        file_name = getattr(audio_file, "name", "") or "voice-note.m4a"
        return transcription_module.transcribe_audio(audio_bytes=audio_bytes, filename=file_name)



class ResponseMonitoringListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role == "RESIDENT":
            queryset = SOS.objects.filter(user=request.user)
        elif request.user.role in ["ADMIN", "SECURITY"]:
            queryset = SOS.objects.all()
        else:
            queryset = SOS.objects.filter(user=request.user)

        search_query = request.query_params.get("search", "")
        if search_query:
            queryset = queryset.filter(
                models.Q(id__icontains=search_query) |
                models.Q(message__icontains=search_query) |
                models.Q(location__icontains=search_query) |
                models.Q(category__icontains=search_query) |
                models.Q(user__username__icontains=search_query) |
                models.Q(user__email__icontains=search_query)
            )

        society = request.query_params.get("society", "")
        if society:
            queryset = queryset.filter(user__resident_profile__society__name__icontains=society)

        resident = request.query_params.get("resident", "")
        if resident:
            queryset = queryset.filter(
                models.Q(user__username__icontains=resident) |
                models.Q(user__email__icontains=resident) |
                models.Q(user_id__icontains=resident)
            )

        incident_type = request.query_params.get("incident_type", "")
        if incident_type:
            queryset = queryset.filter(category__icontains=incident_type)

        current_stage = request.query_params.get("current_stage", "")
        if current_stage:
            current_stage_value = current_stage.strip().lower()
            if current_stage_value == "active":
                queryset = queryset.filter(status__in=["OPEN", "ACTIVE", "IN_PROGRESS"]).exclude(status_events__status="INCIDENT_CLOSED")
            elif current_stage_value == "closed":
                queryset = queryset.filter(status_events__status="INCIDENT_CLOSED")
            else:
                stage_map = {
                    "waiting for guardian": "GUARDIAN_NOTIFIED",
                    "waiting for volunteer": "VOLUNTEER_NOTIFIED",
                    "waiting for security": "SECURITY_NOTIFIED",
                    "escalated": "AUTO_ESCALATED",
                    "active": "TRIGGERED",
                }
                status_value = stage_map.get(current_stage_value)
                if status_value:
                    queryset = queryset.filter(status_events__status=status_value).distinct()

        active_filter = request.query_params.get("active", "")
        if active_filter:
            active_value = str(active_filter).lower() in {"1", "true", "yes", "on"}
            if active_value:
                queryset = queryset.exclude(status_events__status="INCIDENT_CLOSED")
            else:
                queryset = queryset.filter(status_events__status="INCIDENT_CLOSED")

        date_from = request.query_params.get("date_from") or request.query_params.get("start_date")
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)

        date_to = request.query_params.get("date_to") or request.query_params.get("end_date")
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        ordering = request.query_params.get("ordering", "-created_at")
        if ordering not in ["created_at", "-created_at", "updated_at", "-updated_at"]:
            ordering = "-created_at"
        queryset = queryset.order_by(ordering)

        page_size = int(request.query_params.get("page_size") or 10)
        page_number = int(request.query_params.get("page") or 1)
        paginator = Paginator(queryset.distinct(), page_size)
        page = paginator.get_page(page_number)
        serializer = SOSResponseMonitoringSerializer(page.object_list, many=True, context={"request": request})
        return Response({
            "count": paginator.count,
            "page": page.number,
            "page_size": page_size,
            "results": serializer.data,
        }, status=status.HTTP_200_OK)


class ResponseMonitoringDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            sos = SOS.objects.get(pk=pk)
        except SOS.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if request.user.role == "RESIDENT" and sos.user_id != request.user.id:
            return Response(status=status.HTTP_403_FORBIDDEN)

        if request.user.role not in ["ADMIN", "SECURITY", "RESIDENT"]:
            return Response(status=status.HTTP_403_FORBIDDEN)

        serializer = SOSResponseMonitoringSerializer(sos, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


def _is_sos_visible_to_volunteer(sos, user):
    if sos is None or user is None:
        return False

    if str(getattr(user, "role", "") or "").upper() != "VOLUNTEER":
        return False

    resident_owner = getattr(sos, "user", None)
    resident_owner_id = getattr(resident_owner, "id", None)
    user_id = getattr(user, "id", None)
    if user_id is not None and resident_owner_id is not None and user_id == resident_owner_id:
        return False

    try:
        alert_id = str(getattr(sos, "id", ""))
        notification_match = Notification.objects.filter(user=user, kind="SOS").filter(
            Q(data__alert_id=alert_id) | Q(data__alertId=alert_id) | Q(data__alertid=alert_id)
        ).exists()
        pass
        if notification_match:
            return True
    except Exception:
        pass

    service = CommunityBroadcastService()
    # If the SOS has been assigned to a volunteer, only that volunteer should see it
    try:
        assigned_volunteer = getattr(sos, "assigned_volunteer", None)
        assigned_volunteer_id = getattr(assigned_volunteer, "id", None)
        if assigned_volunteer is not None:
            return assigned_volunteer_id == user_id
    except Exception:
        pass

    recipients = service.get_recipients(sos, include_residents=False)
    recipient_match = any(getattr(recipient, "id", None) == getattr(user, "id", None) for recipient in recipients)
    return recipient_match


def _is_sos_visible_to_guardian(sos, user):
    if sos is None or user is None:
        return False

    if str(getattr(user, "role", "") or "").upper() != "GUARDIAN":
        return False

    resident_user = getattr(sos, "user", None)
    if resident_user is None:
        return False

    linked_guardians = _get_linked_guardians_for_resident(resident_user)
    linked_guardian_ids = [getattr(guardian, "id", None) for guardian in linked_guardians]
    guardian_match = any(getattr(guardian, "id", None) == getattr(user, "id", None) for guardian in linked_guardians)
    pass
    return guardian_match


def _can_view_sos_messages(sos, user):
    if sos is None or user is None:
        return False

    role = str(getattr(user, "role", "") or "").upper()

    if role == "RESIDENT":
        return getattr(sos, "user_id", None) == getattr(user, "id", None)

    if role == "VOLUNTEER":
        return _is_sos_visible_to_volunteer(sos, user)

    if role == "GUARDIAN":
        return _is_sos_visible_to_guardian(sos, user)

    return role in ["ADMIN", "SECURITY"]


def _broadcast_chat_message(incident_id, payload):
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return False

        group_send = getattr(channel_layer, "group_send", None)
        if not callable(group_send):
            return False

        async_to_sync(group_send)(f"chat_{incident_id}", {"type": "chat.message", "message": payload})
        return True
    except Exception:
        logger.exception("Failed to broadcast chat message for incident %s", incident_id)
        return False


class ChatHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            sos = SOS.objects.get(pk=pk)
        except SOS.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if not _can_view_sos_messages(sos, request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)

        messages = ChatMessage.objects.filter(incident=sos).order_by("created_at", "id")
        serializer = ChatMessageSerializer(messages, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, pk):
        try:
            sos = SOS.objects.get(pk=pk)
        except SOS.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if not _can_view_sos_messages(sos, request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)

        raw_message = request.data.get("message", "")
        if raw_message is None:
            raw_message = ""
        message_text = str(raw_message).strip()
        if not message_text:
            return Response({"message": "Message cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

        chat_message = ChatMessage.objects.create(
            incident=sos,
            sender=request.user,
            message=message_text,
        )
        serializer = ChatMessageSerializer(chat_message, context={"request": request})
        payload = serializer.data
        _broadcast_chat_message(sos.id, payload)
        return Response(payload, status=status.HTTP_201_CREATED)


class SOSResponseUpdateView(APIView):
    permission_classes = [IsAuthenticated]
    pagination_class = UpdatesPagination

    def _get_status_transition_error(self, sos, new_status):
        normalized_status = str(new_status).upper()
        if normalized_status not in {"ACKNOWLEDGED", "IN_PROGRESS", "ACTIVE", "ESCALATED", "RESOLVED", "CLOSED"}:
            return {"status": ["Unsupported status update. Use ACKNOWLEDGED, IN_PROGRESS, ACTIVE, ESCALATED, RESOLVED, or CLOSED."]}

        mapped_status = {
            "ACKNOWLEDGED": "ACTIVE",
            "IN_PROGRESS": "IN_PROGRESS",
            "ACTIVE": "ACTIVE",
            "ESCALATED": "ESCALATED",
            "RESOLVED": "RESOLVED",
            "CLOSED": "CLOSED",
        }[normalized_status]

        if not sos.can_transition_to(mapped_status):
            return {"status": [f"Invalid status transition from {sos.status} to {mapped_status}"]}

        return None

    def _apply_status_update(self, sos, status_value, request_user):
        error = self._get_status_transition_error(sos, status_value)
        if error is not None:
            return None, error

        normalized_status = str(status_value).upper()
        mapped_status = {
            "ACKNOWLEDGED": "ACTIVE",
            "IN_PROGRESS": "IN_PROGRESS",
            "ACTIVE": "ACTIVE",
            "ESCALATED": "ESCALATED",
            "RESOLVED": "RESOLVED",
            "CLOSED": "CLOSED",
        }[normalized_status]

        if mapped_status == "CLOSED":
            if not sos.closed_at:
                sos.closed_at = timezone.now()
            sos.status = mapped_status
            sos.save(update_fields=["status", "closed_at", "updated_at"])
            sos.record_status_event("INCIDENT_CLOSED", details="Incident closed by security staff")
            return sos, None

        if mapped_status in {"ACTIVE", "IN_PROGRESS", "ESCALATED", "RESOLVED"}:
            sos.status = mapped_status
            sos.save(update_fields=["status", "updated_at"])
            if mapped_status in {"ACTIVE", "IN_PROGRESS", "ESCALATED", "RESOLVED"}:
                sos.record_status_event("SECURITY_RESPONDED", details=f"Incident updated to {mapped_status}")
            return sos, None

        return None, {"status": ["Unsupported status update."]}

    def get(self, request, pk):
        try:
            sos = SOS.objects.get(pk=pk)
        except SOS.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        # Permission checks: residents only read their own; volunteers/security/admin per visibility
        user = request.user
        role = str(getattr(user, "role", "") or "").upper()

        if role == "ADMIN":
            qs = ResponseUpdate.objects.filter(incident=sos).order_by("created_at", "id")
        elif role == "RESIDENT":
            if sos.user_id != user.id:
                return Response(status=status.HTTP_403_FORBIDDEN)
            qs = ResponseUpdate.objects.filter(incident=sos).order_by("created_at", "id")
        elif role in ["VOLUNTEER", "SECURITY"]:
            # allow if visible to the user or assigned
            if role == "SECURITY" and not _is_security_incident_in_scope(sos, user):
                return Response(status=status.HTTP_404_NOT_FOUND)
            try:
                can_view = _can_view_sos_messages(sos, user)
            except Exception:
                can_view = False
            assigned_ok = getattr(sos, "assigned_volunteer_id", None) == getattr(user, "id", None)
            if not (can_view or assigned_ok):
                return Response(status=status.HTTP_403_FORBIDDEN)
            qs = ResponseUpdate.objects.filter(incident=sos).order_by("created_at", "id")
        elif role == "GUARDIAN":
            # Guardians may view updates only for incidents they are linked/authorized to see
            try:
                can_view = _is_sos_visible_to_guardian(sos, user)
            except Exception:
                can_view = False
            if not can_view:
                return Response(status=status.HTTP_403_FORBIDDEN)
            qs = ResponseUpdate.objects.filter(incident=sos).order_by("created_at", "id")
        else:
            return Response(status=status.HTTP_403_FORBIDDEN)

        # paginate
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request)
        serializer = ResponseUpdateSerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)

    def post(self, request, pk):
        try:
            sos = SOS.objects.get(pk=pk)
        except SOS.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        user = request.user
        role = str(getattr(user, "role", "") or "").upper()

        if role not in ["ADMIN", "SECURITY", "VOLUNTEER"]:
            return Response(status=status.HTTP_403_FORBIDDEN)

        # Ensure the poster can modify/create an update for this incident
        if role == "SECURITY" and not _is_security_incident_in_scope(sos, user):
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            can_view = _can_view_sos_messages(sos, user)
        except Exception:
            can_view = False
        assigned_ok = getattr(sos, "assigned_volunteer_id", None) == getattr(user, "id", None)
        if role in ["VOLUNTEER", "SECURITY"] and not (can_view or assigned_ok):
            return Response(status=status.HTTP_403_FORBIDDEN)

        serializer = ResponseUpdateSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        status_value = request.data.get("status")
        if status_value is not None:
            updated_sos, status_error = self._apply_status_update(sos, status_value, user)
            if status_error is not None:
                return Response(status_error, status=status.HTTP_400_BAD_REQUEST)
            sos = updated_sos

        update = serializer.save(incident=sos, user=user, role=role)
        out = ResponseUpdateSerializer(update, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)


class SOSStatusTrackingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            sos = SOS.objects.get(pk=pk)
        except SOS.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if request.user.role == "RESIDENT" and sos.user_id != request.user.id:
            return Response(status=status.HTTP_403_FORBIDDEN)

        if request.user.role == "VOLUNTEER" and not _is_sos_visible_to_volunteer(sos, request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)

        if request.user.role == "GUARDIAN" and not _is_sos_visible_to_guardian(sos, request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)

        if request.user.role not in ["ADMIN", "SECURITY", "RESIDENT", "VOLUNTEER", "GUARDIAN"]:
            return Response(status=status.HTTP_403_FORBIDDEN)

        serializer = SOSStatusDetailSerializer(sos, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class SOSStatusListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role == "RESIDENT":
            queryset = SOS.objects.filter(user=request.user)
        elif request.user.role in ["ADMIN", "SECURITY"]:
            queryset = SOS.objects.all()
        else:
            queryset = SOS.objects.filter(user=request.user)

        status_filter = request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status_events__status=status_filter.upper()).distinct()

        count_queryset = queryset

        search_query = request.query_params.get("search", "")
        if search_query:
            queryset = queryset.filter(
                models.Q(id__icontains=search_query) |
                models.Q(message__icontains=search_query) |
                models.Q(location__icontains=search_query) |
                models.Q(category__icontains=search_query) |
                models.Q(user__username__icontains=search_query) |
                models.Q(user__email__icontains=search_query)
            )

        ordering = request.query_params.get("ordering", "-created_at")
        if ordering not in ["created_at", "-created_at", "updated_at", "-updated_at"]:
            ordering = "-created_at"
        queryset = queryset.order_by(ordering)

        page_size = int(request.query_params.get("page_size") or 10)
        page_number = int(request.query_params.get("page") or 1)
        paginator = Paginator(queryset, page_size)
        page = paginator.get_page(page_number)

        serializer = SOSStatusListItemSerializer(page.object_list, many=True, context={"request": request})
        return Response({
            "count": count_queryset.count(),
            "page": page.number,
            "page_size": page_size,
            "results": serializer.data,
        }, status=status.HTTP_200_OK)


class SOSAlertManagementView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        if pk is not None:
            try:
                sos = SOS.objects.get(pk=pk)
            except SOS.DoesNotExist:
                return Response(status=status.HTTP_404_NOT_FOUND)

            if request.user.role == "RESIDENT" and sos.user_id != request.user.id:
                return Response(status=status.HTTP_403_FORBIDDEN)

            if request.user.role == "GUARDIAN" and not _is_sos_visible_to_guardian(sos, request.user):
                return Response(status=status.HTTP_403_FORBIDDEN)

            if request.user.role not in ["ADMIN", "SECURITY", "VOLUNTEER", "RESIDENT", "GUARDIAN"]:
                return Response(status=status.HTTP_403_FORBIDDEN)

            serializer = SOSSerializer(sos, context={"request": request})
            return Response(serializer.data, status=status.HTTP_200_OK)

        if request.user.role == "RESIDENT":
            sos_list = SOS.objects.filter(user=request.user).order_by("-created_at")
        elif request.user.role in ["SECURITY", "ADMIN"]:
            sos_list = SOS.objects.all().order_by("-created_at")
        elif request.user.role == "VOLUNTEER":
            visible_sos_ids = [
                sos.id
                for sos in SOS.objects.all().order_by("-created_at")
                if _is_sos_visible_to_volunteer(sos, request.user)
            ]
            sos_list = SOS.objects.filter(pk__in=visible_sos_ids).order_by("-created_at")
        elif request.user.role == "GUARDIAN":
            visible_sos_ids = [
                sos.id
                for sos in SOS.objects.all().order_by("-created_at")
                if _is_sos_visible_to_guardian(sos, request.user)
            ]
            sos_list = SOS.objects.filter(pk__in=visible_sos_ids).order_by("-created_at")
        else:
            sos_list = SOS.objects.filter(user=request.user).order_by("-created_at")

        serializer = SOSSerializer(sos_list, many=True, context={"request": request})
        return Response(serializer.data)

    def patch(self, request, pk):
        if not isinstance(request.user.role, str):
            return Response(status=status.HTTP_403_FORBIDDEN)

        try:
            sos = SOS.objects.get(pk=pk)
        except SOS.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if request.user.role == "ADMIN":
            serializer = SOSStatusUpdateSerializer(sos, data=request.data, partial=True)
            if serializer.is_valid():
                previous_status = str(getattr(sos, "status", "") or "").upper()
                updated_sos = serializer.save()
                if "status" in request.data:
                    normalized_status = str(request.data.get("status", "")).upper()
                    if normalized_status == "CLOSED":
                        if not updated_sos.closed_at:
                            updated_sos.closed_at = timezone.now()
                            updated_sos.save(update_fields=["closed_at"])

                        closure_notes = request.data.get("closure_notes") or updated_sos.closure_notes or ""
                        resolution_summary = request.data.get("resolution_summary") or updated_sos.resolution_summary or ""
                        actions_taken = request.data.get("actions_taken") or updated_sos.actions_taken or ""
                        additional_remarks = request.data.get("additional_remarks") or updated_sos.additional_remarks or ""

                        message_parts = []
                        if closure_notes:
                            message_parts.append(f"Closure notes: {closure_notes}")
                        if resolution_summary:
                            message_parts.append(f"Resolution summary: {resolution_summary}")
                        if actions_taken:
                            message_parts.append(f"Actions taken: {actions_taken}")
                        if additional_remarks:
                            message_parts.append(f"Additional remarks: {additional_remarks}")

                        closure_message = "\n\n".join(message_parts) if message_parts else "Incident closed."
                        if previous_status != "CLOSED":
                            SOSMessage.objects.create(
                                sos=updated_sos,
                                sender=request.user,
                                message=closure_message,
                                transcription_status="NOT_REQUIRED",
                            )

                        updated_sos.record_status_event(
                            "INCIDENT_CLOSED",
                            details=(
                                request.data.get("resolution_summary")
                                or request.data.get("closure_notes")
                                or request.data.get("actions_taken")
                                or "Incident closed"
                            ),
                        )
                    elif normalized_status in {"IN_PROGRESS", "ACTIVE", "ESCALATED"}:
                        updated_sos.record_status_event("SECURITY_RESPONDED", details="Security responded")
                    elif normalized_status == "RESOLVED":
                        updated_sos.record_status_event("SECURITY_RESPONDED", details="Incident marked resolved")
                return Response(SOSSerializer(updated_sos, context={"request": request}).data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        if request.user.role in ["VOLUNTEER", "SECURITY"]:
            action = str(request.data.get("action", "")).strip().lower()
            if action == "accept":
                try:
                    with transaction.atomic():
                        locked_sos = SOS.objects.select_for_update().get(pk=sos.pk)
                        # Prevent accepting incidents that are already assigned or closed
                        if str(getattr(locked_sos, "status", "") or "").upper() == "CLOSED" or locked_sos.status_events.filter(status="INCIDENT_CLOSED").exists():
                            return Response({"detail": "Cannot accept a closed incident."}, status=status.HTTP_409_CONFLICT)

                        existing_assignment = locked_sos.assigned_volunteer is not None or locked_sos.status_events.filter(
                            status__in=["VOLUNTEER_ACCEPTED", "SECURITY_RESPONDED"]
                        ).exists()
                        if existing_assignment:
                            return Response({"detail": "Incident already assigned."}, status=status.HTTP_409_CONFLICT)

                        if request.user.role == "VOLUNTEER":
                            # assign the volunteer, transition lifecycle to ACTIVE, and record event
                            locked_sos.assigned_volunteer = request.user
                            locked_sos.status = "ACTIVE"
                            locked_sos.save(update_fields=["assigned_volunteer", "status", "updated_at"])
                            locked_sos.record_status_event("VOLUNTEER_ACCEPTED", details="Volunteer accepted the incident")

                            Notification.objects.create(
                                user=request.user,
                                title="Incident assigned",
                                body=f"You have been assigned to SOS incident {locked_sos.id}.",
                                kind="SOS",
                                data={
                                    "type": "SOS_ASSIGNMENT",
                                    "alert_id": str(locked_sos.id),
                                    "assigned_to": str(request.user.id),
                                    "target": f"/alerts?alert_id={locked_sos.id}",
                                },
                            )
                        else:
                            locked_sos.assigned_volunteer = request.user
                            locked_sos.status = "ACTIVE"
                            locked_sos.save(update_fields=["assigned_volunteer", "status", "updated_at"])
                            locked_sos.record_status_event("SECURITY_RESPONDED", details="Security responded to the incident")
                        return Response(SOSSerializer(locked_sos, context={"request": request}).data, status=status.HTTP_200_OK)
                except SOS.DoesNotExist:
                    return Response(status=status.HTTP_404_NOT_FOUND)
            return Response(status=status.HTTP_403_FORBIDDEN)

        if request.user.role == "GUARDIAN":
            return Response(status=status.HTTP_403_FORBIDDEN)

        if request.user.role == "RESIDENT":
            if sos.user_id != request.user.id:
                return Response(status=status.HTTP_403_FORBIDDEN)

            serializer = SOSResidentUpdateSerializer(sos, data=request.data, partial=True)
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

            updated_sos = serializer.save()

            latitude = request.data.get("latitude", None)
            longitude = request.data.get("longitude", None)
            latitude_value = None if latitude in [None, "", " "] else float(latitude)
            longitude_value = None if longitude in [None, "", " "] else float(longitude)

            should_refresh_geocoding = (
                ("latitude" in request.data or "longitude" in request.data)
                and (
                    latitude_value != updated_sos.latitude
                    or longitude_value != updated_sos.longitude
                )
            )

            if should_refresh_geocoding:
                geocode_payload = reverse_geocode_coordinates(latitude_value, longitude_value) or {}
                updated_sos.address = geocode_payload.get("address") or None
                updated_sos.city = geocode_payload.get("city") or None
                updated_sos.state = geocode_payload.get("state") or None
                updated_sos.country = geocode_payload.get("country") or None
                updated_sos.location = geocode_payload.get("location") or updated_sos.location or ""
                updated_sos.save(update_fields=["address", "city", "state", "country", "location"])

            return Response(SOSSerializer(updated_sos, context={"request": request}).data, status=status.HTTP_200_OK)

        return Response(status=status.HTTP_403_FORBIDDEN)

    def delete(self, request, pk):
        if not isinstance(request.user.role, str):
            return Response(status=status.HTTP_403_FORBIDDEN)

        try:
            sos = SOS.objects.get(pk=pk)
        except SOS.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if request.user.role == "ADMIN":
            sos.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        if request.user.role == "RESIDENT":
            if sos.user_id != request.user.id:
                return Response(status=status.HTTP_403_FORBIDDEN)

            sos.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        return Response(status=status.HTTP_403_FORBIDDEN)


def _get_admin_reporting_queryset(request):
    qs = SOS.objects.all().select_related("user")

    date_from = request.query_params.get("start_date") or request.query_params.get("date_from")
    date_to = request.query_params.get("end_date") or request.query_params.get("date_to")
    if date_from:
        qs = qs.filter(created_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(created_at__date__lte=date_to)

    society = request.query_params.get("society")
    if society:
        if str(society).isdigit():
            qs = qs.filter(user__resident_profile__society__id=int(society))
        else:
            qs = qs.filter(user__resident_profile__society__name__icontains=society)

    category = request.query_params.get("category") or request.query_params.get("incident_type")
    if category:
        qs = qs.filter(category__icontains=category)

    return qs


def _build_admin_report_payload(qs):
    total_incidents = qs.count()
    active_incidents = 0
    escalated_incidents = 0
    resolved_incidents = 0

    category_counts_qs = qs.values("category").annotate(count=Count("id"))
    category_counts = {c["category"] or "": c["count"] for c in category_counts_qs}

    society_counts = {}
    guardian_times = []
    volunteer_times = []
    security_times = []
    total_resolution_times = []

    for sos in qs.order_by("id"):
        current_status = sos.get_current_lifecycle_status()
        status_field = str(getattr(sos, "status", "") or "").upper()
        if current_status == "INCIDENT_CLOSED" or status_field in {"RESOLVED", "CLOSED"}:
            resolved_incidents += 1
        else:
            active_incidents += 1
            if status_field == "ESCALATED" or current_status == "AUTO_ESCALATED":
                escalated_incidents += 1

        try:
            soc = getattr(getattr(sos.user, "resident_profile", None), "society", None)
            soc_name = getattr(soc, "name", None) or "<unknown>"
        except Exception:
            soc_name = "<unknown>"

        entry = society_counts.get(soc_name) or {"total": 0, "active": 0, "escalated": 0, "resolved": 0}
        entry["total"] += 1
        if current_status == "INCIDENT_CLOSED" or status_field in {"RESOLVED", "CLOSED"}:
            entry["resolved"] += 1
        else:
            entry["active"] += 1
            if status_field == "ESCALATED" or current_status == "AUTO_ESCALATED":
                entry["escalated"] += 1
        society_counts[soc_name] = entry

        timeline = list(sos.get_status_timeline())
        created_at = sos.created_at
        if created_at is None:
            continue

        guardian_response_seconds = None
        volunteer_response_seconds = None
        security_response_seconds = None
        total_resolution_seconds = None

        for event in timeline:
            if event.status == "GUARDIAN_RESPONDED" and guardian_response_seconds is None:
                guardian_response_seconds = int((event.occurred_at - created_at).total_seconds())
            if event.status == "VOLUNTEER_ACCEPTED" and volunteer_response_seconds is None:
                volunteer_response_seconds = int((event.occurred_at - created_at).total_seconds())
            if event.status == "SECURITY_RESPONDED" and security_response_seconds is None:
                security_response_seconds = int((event.occurred_at - created_at).total_seconds())
            if event.status == "INCIDENT_CLOSED" and total_resolution_seconds is None:
                total_resolution_seconds = int((event.occurred_at - created_at).total_seconds())

        if guardian_response_seconds is not None:
            guardian_times.append(guardian_response_seconds)
        if volunteer_response_seconds is not None:
            volunteer_times.append(volunteer_response_seconds)
        if security_response_seconds is not None:
            security_times.append(security_response_seconds)
        if total_resolution_seconds is not None:
            total_resolution_times.append(total_resolution_seconds)

    def avg_or_none(lst):
        return int(sum(lst) / len(lst)) if lst else None

    response_time_summary = {
        "guardian_response_seconds_avg": avg_or_none(guardian_times),
        "volunteer_response_seconds_avg": avg_or_none(volunteer_times),
        "security_response_seconds_avg": avg_or_none(security_times),
        "total_resolution_seconds_avg": avg_or_none(total_resolution_times),
        "counts": {
            "with_guardian_response": len(guardian_times),
            "with_volunteer_response": len(volunteer_times),
            "with_security_response": len(security_times),
            "with_total_resolution": len(total_resolution_times),
        },
    }

    return {
        "total_incidents": total_incidents,
        "active_incidents": active_incidents,
        "escalated_incidents": escalated_incidents,
        "resolved_incidents": resolved_incidents,
        "category_counts": category_counts,
        "society_counts": society_counts,
        "response_time_summary": response_time_summary,
    }


def _render_reporting_excel(payload):
    def text_cell(text):
        return escape(str(text) if text is not None else "")

    html_lines = [
        "<html>",
        "<head><meta http-equiv=\"content-type\" content=\"text/html; charset=utf-8\"/></head>",
        "<body>",
        "<h2>SOS Reporting Export</h2>",
    ]

    html_lines.append("<table border=\"1\" cellpadding=\"4\" cellspacing=\"0\">")
    html_lines.append("<tr><th>Metric</th><th>Value</th></tr>")
    html_lines.append(f"<tr><td>Total Incidents</td><td>{text_cell(payload['total_incidents'])}</td></tr>")
    html_lines.append(f"<tr><td>Active Incidents</td><td>{text_cell(payload['active_incidents'])}</td></tr>")
    html_lines.append(f"<tr><td>Escalated Incidents</td><td>{text_cell(payload['escalated_incidents'])}</td></tr>")
    html_lines.append(f"<tr><td>Resolved Incidents</td><td>{text_cell(payload['resolved_incidents'])}</td></tr>")
    html_lines.append("</table><br/>")

    html_lines.append("<h3>Category Counts</h3>")
    html_lines.append("<table border=\"1\" cellpadding=\"4\" cellspacing=\"0\">")
    html_lines.append("<tr><th>Category</th><th>Count</th></tr>")
    if payload["category_counts"]:
        for category, count in payload["category_counts"].items():
            html_lines.append(f"<tr><td>{text_cell(category or '(blank)')}</td><td>{text_cell(count)}</td></tr>")
    else:
        html_lines.append("<tr><td colspan=\"2\">(none)</td></tr>")
    html_lines.append("</table><br/>")

    html_lines.append("<h3>Society Counts</h3>")
    html_lines.append("<table border=\"1\" cellpadding=\"4\" cellspacing=\"0\">")
    html_lines.append("<tr><th>Society</th><th>Total</th><th>Active</th><th>Escalated</th><th>Resolved</th></tr>")
    if payload["society_counts"]:
        for society_name, counts in payload["society_counts"].items():
            html_lines.append(
                f"<tr><td>{text_cell(society_name)}</td><td>{text_cell(counts['total'])}</td>"
                f"<td>{text_cell(counts['active'])}</td><td>{text_cell(counts['escalated'])}</td>"
                f"<td>{text_cell(counts['resolved'])}</td></tr>"
            )
    else:
        html_lines.append("<tr><td colspan=\"5\">(none)</td></tr>")
    html_lines.append("</table><br/>")

    html_lines.append("<h3>Response Time Summary</h3>")
    html_lines.append("<table border=\"1\" cellpadding=\"4\" cellspacing=\"0\">")
    html_lines.append("<tr><th>Metric</th><th>Value</th></tr>")
    summary = payload["response_time_summary"]
    html_lines.append(f"<tr><td>Guardian Response Avg (sec)</td><td>{text_cell(summary['guardian_response_seconds_avg'])}</td></tr>")
    html_lines.append(f"<tr><td>Volunteer Response Avg (sec)</td><td>{text_cell(summary['volunteer_response_seconds_avg'])}</td></tr>")
    html_lines.append(f"<tr><td>Security Response Avg (sec)</td><td>{text_cell(summary['security_response_seconds_avg'])}</td></tr>")
    html_lines.append(f"<tr><td>Total Resolution Avg (sec)</td><td>{text_cell(summary['total_resolution_seconds_avg'])}</td></tr>")
    for label, value in summary["counts"].items():
        html_lines.append(f"<tr><td>{text_cell(label.replace('_', ' ').title())}</td><td>{text_cell(value)}</td></tr>")
    html_lines.append("</table>")

    html_lines.append("</body>")
    html_lines.append("</html>")
    return "\n".join(html_lines).encode("utf-8")


def _pdf_escape(text):
    text = str(text) if text is not None else ""
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_pdf_bytes(lines):
    body_lines = ["BT /F1 10 Tf 50 820 Td"]
    for index, line in enumerate(lines):
        if index > 0:
            body_lines.append("0 -14 Td")
        body_lines.append(f"({_pdf_escape(line)}) Tj")
    body_lines.append("ET")
    body = "\n".join(body_lines).encode("latin-1", "replace")

    objects = []
    offsets = []

    catalog = b"1 0 obj << /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    pages = b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    page = b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n"
    contents = b"4 0 obj << /Length " + str(len(body)).encode("ascii") + b" >>\nstream\n" + body + b"\nendstream\nendobj\n"
    font = b"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n"

    objects = [catalog, pages, page, contents, font]
    pdf = [b"%PDF-1.4\n"]
    position = len(pdf[0])
    for obj in objects:
        offsets.append(position)
        pdf.append(obj)
        position += len(obj)

    xref = [b"xref\n0 %d\n" % (len(objects) + 1), b"0000000000 65535 f \n"]
    for offset in offsets:
        xref.append(f"{offset:010d} 00000 n \n".encode("ascii"))
    startxref = position
    pdf.append(b"".join(xref))
    trailer = f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref {startxref}\n%%EOF\n".encode("ascii")
    pdf.append(trailer)

    return b"".join(pdf)


def _render_reporting_pdf(payload):
    lines = [
        "SOS Reporting Export",
        "",
        f"Total incidents: {payload['total_incidents']}",
        f"Active incidents: {payload['active_incidents']}",
        f"Escalated incidents: {payload['escalated_incidents']}",
        f"Resolved incidents: {payload['resolved_incidents']}",
        "",
        "Category counts:",
    ]
    if payload["category_counts"]:
        for category, count in payload["category_counts"].items():
            lines.append(f"  {category or '(blank)'}: {count}")
    else:
        lines.append("  (none)")

    lines.append("")
    lines.append("Society counts:")
    if payload["society_counts"]:
        for society_name, counts in payload["society_counts"].items():
            lines.append(
                f"  {society_name}: total={counts['total']}, active={counts['active']}, "
                f"escalated={counts['escalated']}, resolved={counts['resolved']}"
            )
    else:
        lines.append("  (none)")

    lines.append("")
    lines.append("Response time summary:")
    response_summary = payload["response_time_summary"]
    lines.append(f"  Guardian response avg (sec): {response_summary['guardian_response_seconds_avg']}")
    lines.append(f"  Volunteer response avg (sec): {response_summary['volunteer_response_seconds_avg']}")
    lines.append(f"  Security response avg (sec): {response_summary['security_response_seconds_avg']}")
    lines.append(f"  Total resolution avg (sec): {response_summary['total_resolution_seconds_avg']}")
    for key, value in response_summary['counts'].items():
        lines.append(f"  {key.replace('_', ' ').title()}: {value}")

    return _build_pdf_bytes(lines)


class AdminReportingView(APIView):
    """Platform-wide reporting endpoint for Admin users.

    Query params:
    - start_date / date_from : YYYY-MM-DD
    - end_date / date_to : YYYY-MM-DD
    - society : society id or name
    - category : incident category string
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = _get_admin_reporting_queryset(request)
        payload = _build_admin_report_payload(qs)
        return Response(payload, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        if not isinstance(request.user.role, str):
            return Response(status=status.HTTP_403_FORBIDDEN)

        try:
            sos = SOS.objects.get(pk=pk)
        except SOS.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if request.user.role == "ADMIN":
            sos.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        if request.user.role == "RESIDENT":
            if sos.user_id != request.user.id:
                return Response(status=status.HTTP_403_FORBIDDEN)

            sos.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        return Response(status=status.HTTP_403_FORBIDDEN)


class AdminReportingExportExcelView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = _get_admin_reporting_queryset(request)
        payload = _build_admin_report_payload(qs)
        contents = _render_reporting_excel(payload)
        response = HttpResponse(contents, content_type="application/vnd.ms-excel")
        response["Content-Disposition"] = "attachment; filename=\"sos_reporting.xls\""
        return response


class AdminReportingExportPdfView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = _get_admin_reporting_queryset(request)
        payload = _build_admin_report_payload(qs)
        contents = _render_reporting_pdf(payload)
        response = HttpResponse(contents, content_type="application/pdf")
        response["Content-Disposition"] = "attachment; filename=\"sos_reporting.pdf\""
        return response