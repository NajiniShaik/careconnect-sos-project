import logging
import re
from typing import List

from django.conf import settings
from django.db import models, transaction
from django.shortcuts import render
from django.contrib.auth import get_user_model
from django.core.paginator import Paginator
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
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
)
from .models import SOS, SOSMessage, SOSStatusEvent
from . import transcription as transcription_module
from .transcription import enqueue_transcription
from .utils import reverse_geocode_coordinates
from users.permissions import IsAdmin, IsResident, IsSecurity
from notifications.models import DeviceToken, Notification, NotificationDelivery
from notifications.tasks import send_push_notification_task, send_email_notification_task, send_sms_notification_task, process_community_broadcast_task
from society.models import Society

logger = logging.getLogger(__name__)


class DashboardPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


class DashboardOverviewView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        sos_queryset = SOS.objects.select_related("user").all()

        active_incidents = 0
        resolved_incidents = 0
        for sos in sos_queryset:
            current_status = sos.get_current_lifecycle_status()
            if current_status == "INCIDENT_CLOSED" or str(getattr(sos, "status", "")).upper() == "RESOLVED":
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
    permission_classes = [IsAuthenticated, IsAdmin]
    pagination_class = DashboardPagination

    def get(self, request):
        activities = []
        for sos in SOS.objects.select_related("user").order_by("-created_at", "-id"):
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


def _get_sos_recipients(resident_user, society_name):
    recipients = [resident_user]
    User = get_user_model()

    try:
        guardians = list(User.objects.filter(role="GUARDIAN"))
        recipients.extend([guardian for guardian in guardians if guardian and guardian.id != getattr(resident_user, "id", None)])
    except Exception:
        guardians = []

    try:
        security_users = list(User.objects.filter(role="SECURITY"))
        recipients.extend([security_user for security_user in security_users if security_user and security_user.id != getattr(resident_user, "id", None)])
    except Exception:
        security_users = []

    try:
        volunteer_users = list(User.objects.filter(role="VOLUNTEER"))
        recipients.extend([volunteer_user for volunteer_user in volunteer_users if volunteer_user and volunteer_user.id != getattr(resident_user, "id", None)])
    except Exception:
        volunteer_users = []

    try:
        admin_qs = _get_society_admin_queryset(User, society_name)
        recipients.extend([admin_user for admin_user in admin_qs if admin_user and admin_user.id != getattr(resident_user, "id", None)])
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

        if request.user.role == "RESIDENT" and sos.user_id != request.user.id:
            return Response(status=status.HTTP_403_FORBIDDEN)

        if request.user.role not in ["RESIDENT", "SECURITY", "ADMIN"]:
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


class SOSStatusTrackingView(APIView):
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

            if request.user.role not in ["ADMIN", "SECURITY", "VOLUNTEER", "RESIDENT"]:
                return Response(status=status.HTTP_403_FORBIDDEN)

            serializer = SOSSerializer(sos, context={"request": request})
            return Response(serializer.data, status=status.HTTP_200_OK)

        if request.user.role == "RESIDENT":
            sos_list = SOS.objects.filter(user=request.user).order_by("-created_at")
        elif request.user.role in ["SECURITY", "ADMIN"]:
            sos_list = SOS.objects.all().order_by("-created_at")
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
                serializer.save()
                if "status" in request.data:
                    normalized_status = str(request.data.get("status", "")).upper()
                    if normalized_status in {"RESOLVED", "CLOSED"}:
                        sos.record_status_event("INCIDENT_CLOSED", details="Incident closed")
                    elif normalized_status in {"IN_PROGRESS", "ACTIVE", "ESCALATED"}:
                        sos.record_status_event("SECURITY_RESPONDED", details="Security responded")
                return Response(SOSSerializer(sos, context={"request": request}).data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        if request.user.role in ["VOLUNTEER", "SECURITY"]:
            action = str(request.data.get("action", "")).strip().lower()
            if action == "accept":
                if request.user.role == "VOLUNTEER":
                    sos.record_status_event("VOLUNTEER_ACCEPTED", details="Volunteer accepted the incident")
                else:
                    sos.record_status_event("SECURITY_RESPONDED", details="Security responded to the incident")
                return Response(SOSSerializer(sos, context={"request": request}).data, status=status.HTTP_200_OK)
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