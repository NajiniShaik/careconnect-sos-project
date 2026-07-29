from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
import logging

from django.contrib.auth import get_user_model
from django.utils import timezone
from django.db.models import Q
from rest_framework.pagination import PageNumberPagination

from users.permissions import IsAdmin
from .serializers import NotificationDeliverySerializer
from sos.models import SOS
from .models import DeviceToken, Notification, NotificationDelivery, EscalationConfiguration, EscalationLog
from .serializers import RegisterDeviceSerializer, EscalationConfigurationSerializer, EscalationLogSerializer
from .serializers import NotificationTemplateSerializer
from .models import NotificationTemplate
from .tasks import process_community_broadcast_task
from .community_broadcast import CommunityBroadcastService

logger = logging.getLogger(__name__)


class RegisterDeviceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logger.info("RegisterDeviceView request data: %s", request.data)
        serializer = RegisterDeviceSerializer(data=request.data)
        is_valid = serializer.is_valid()
        logger.info("RegisterDeviceView serializer is_valid=%s errors=%s", is_valid, serializer.errors)
        if not is_valid:
            return Response({"success": False, "message": "Invalid data", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        logger.info("RegisterDeviceView validated data: %s", serializer.validated_data)

        device_token = serializer.validated_data.get("device_token")
        if not device_token:
            return Response({"success": False, "message": "Token cannot be blank"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            platform = serializer.validated_data.get("platform") or "android"
            device_id = serializer.validated_data.get("device_id") or ""

            if not device_id:
                device_id = f"user-{request.user.pk}"

            existing_token_users = []
            if device_token:
                existing_token_users = list(
                    get_user_model().objects.filter(device_token=device_token).exclude(pk=request.user.pk)
                )

            for existing_user in existing_token_users:
                if getattr(existing_user, "device_token", None) == device_token:
                    existing_user.device_token = ""
                    existing_user.save(update_fields=["device_token"])

            DeviceToken.objects.filter(token=device_token).exclude(user=request.user).delete()
            DeviceToken.objects.filter(user=request.user).filter(Q(device_id=device_id) | Q(token=device_token)).exclude(token=device_token).delete()

            request.user.device_token = device_token
            request.user.save(update_fields=["device_token"])

            DeviceToken.objects.update_or_create(
                user=request.user,
                device_id=device_id,
                defaults={
                    "token": device_token,
                    "platform": platform,
                    "updated_at": timezone.now(),
                },
            )

            logger.info("Registered device token for user %s via notifications endpoint platform=%s device_id=%s", request.user.pk, platform, device_id or "")
            return Response({"success": True, "message": "Device token registered successfully."}, status=status.HTTP_200_OK)
        except Exception as exc:
            logger.exception("Failed to save device token for user %s: %s", request.user.pk, exc)
            return Response({"success": False, "message": "Unable to register device token."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def delete(self, request):
        token = request.data.get("token") or request.query_params.get("token")
        try:
            if token:
                if getattr(request.user, "device_token", None) == token:
                    request.user.device_token = ""
                    request.user.save(update_fields=["device_token"])
                deleted, _ = DeviceToken.objects.filter(user=request.user, token=token).delete()
            else:
                request.user.device_token = ""
                request.user.save(update_fields=["device_token"])
                deleted, _ = DeviceToken.objects.filter(user=request.user).delete()

            return Response({"success": True, "message": "Device token(s) removed."}, status=status.HTTP_200_OK)
        except Exception as exc:
            logger.exception("Failed to remove device token: %s", exc)
            return Response({"success": False, "message": "Unable to remove device token(s)."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DeliveryStatusPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class DeliveryStatusListView(APIView):
    permission_classes = [IsAuthenticated]
    pagination_class = DeliveryStatusPagination

    def get(self, request):
        queryset = NotificationDelivery.objects.select_related("notification", "notification__user").all()
        role = str(getattr(request.user, "role", "") or "").upper()
        if role != "ADMIN":
            queryset = queryset.filter(notification__user=request.user)

        channel = request.query_params.get("channel")
        if channel:
            queryset = queryset.filter(channel__iexact=channel)
        status = request.query_params.get("status")
        if status:
            queryset = queryset.filter(status__iexact=status)
        notification_type = request.query_params.get("notification_type")
        if notification_type:
            queryset = queryset.filter(notification_type__icontains=notification_type)
        recipient_role = request.query_params.get("recipient_role")
        if recipient_role:
            queryset = queryset.filter(recipient_role__iexact=recipient_role)
        date_value = request.query_params.get("date")
        if date_value:
            queryset = queryset.filter(created_at__date=date_value)
        search = request.query_params.get("search", "")
        if search:
            queryset = queryset.filter(
                Q(recipient__icontains=search) |
                Q(recipient_name__icontains=search) |
                Q(recipient_role__icontains=search) |
                Q(notification__title__icontains=search) |
                Q(notification__body__icontains=search)
            )

        ordering = request.query_params.get("ordering", "-created_at")
        if ordering not in ["created_at", "-created_at", "updated_at", "-updated_at", "timestamp", "-timestamp"]:
            ordering = "-created_at"
        queryset = queryset.order_by(ordering)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = NotificationDeliverySerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class DeliveryStatusDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            delivery = NotificationDelivery.objects.select_related("notification", "notification__user").get(pk=pk)
        except NotificationDelivery.DoesNotExist:
            return Response({"detail": "Delivery record not found"}, status=status.HTTP_404_NOT_FOUND)

        role = str(getattr(request.user, "role", "") or "").upper()
        if role != "ADMIN" and delivery.notification.user_id != request.user.id:
            return Response(status=status.HTTP_403_FORBIDDEN)

        serializer = NotificationDeliverySerializer(delivery)
        return Response(serializer.data, status=status.HTTP_200_OK)


class EscalationLogPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class EscalationLogListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]
    pagination_class = EscalationLogPagination

    def get(self, request):
        queryset = EscalationLog.objects.select_related("sos", "recipient_user").order_by("-timestamp", "-id")
        sos_id = request.query_params.get("sos")
        if sos_id:
            queryset = queryset.filter(sos_id=sos_id)
        escalation_level = request.query_params.get("escalation_level")
        if escalation_level:
            queryset = queryset.filter(escalation_level=escalation_level)
        status = request.query_params.get("status")
        if status:
            queryset = queryset.filter(status=status)
        date_value = request.query_params.get("date")
        if date_value:
            queryset = queryset.filter(timestamp__date=date_value)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = EscalationLogSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def delete(self, request):
        # Delete all escalation logs. Keep permission restricted to Admins via permission_classes
        try:
            # Allow optional filters to restrict deletion (mirrors GET filters)
            queryset = EscalationLog.objects.all()
            escalation_level = request.query_params.get("escalation_level")
            if escalation_level:
                queryset = queryset.filter(escalation_level=escalation_level)

            sos_id = request.query_params.get("sos")
            if sos_id:
                queryset = queryset.filter(sos_id=sos_id)

            deleted_count, _ = queryset.delete()
            return Response({"success": True, "deleted": deleted_count, "message": "Escalation logs deleted."}, status=status.HTTP_200_OK)
        except Exception as exc:
            logger.exception("Failed to delete escalation logs: %s", exc)
            return Response({"success": False, "message": "Unable to delete escalation logs."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class EscalationLogDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        try:
            log = EscalationLog.objects.select_related("sos", "recipient_user").get(pk=pk)
        except EscalationLog.DoesNotExist:
            return Response({"detail": "Escalation log not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = EscalationLogSerializer(log)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        try:
            log = EscalationLog.objects.get(pk=pk)
        except EscalationLog.DoesNotExist:
            return Response({"detail": "Escalation log not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            log.delete()
            return Response({"success": True, "message": "Escalation log deleted."}, status=status.HTTP_200_OK)
        except Exception as exc:
            logger.exception("Failed to delete escalation log %s: %s", pk, exc)
            return Response({"success": False, "message": "Unable to delete escalation log."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class EscalationConfigurationView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get_object(self):
        obj, _ = EscalationConfiguration.objects.get_or_create(
            defaults={
                "response_timeout_minutes": 5,
                "escalation_enabled": True,
                "escalate_to_secondary_guardian": True,
                "escalate_to_emergency_contacts": True,
            },
        )
        return obj

    def get(self, request):
        config = self.get_object()
        serializer = EscalationConfigurationSerializer(config)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request):
        config = self.get_object()
        serializer = EscalationConfigurationSerializer(config, data=request.data, partial=False)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class CommunityBroadcastView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        sos_id = request.data.get("sos_id")
        if not sos_id:
            return Response({"detail": "sos_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            sos = SOS.objects.get(pk=sos_id)
        except SOS.DoesNotExist:
            return Response({"detail": "SOS not found"}, status=status.HTTP_404_NOT_FOUND)

        include_residents = bool(request.data.get("include_residents", False))
        radius = request.data.get("broadcast_radius_meters")
        service = CommunityBroadcastService(radius_filter=None)
        recipients = service.get_recipients(sos, include_residents=include_residents, broadcast_radius_meters=radius)
        summary = service._build_summary(recipients)
        process_community_broadcast_task.delay(sos.id, include_residents=include_residents, broadcast_radius_meters=radius)

        return Response({
            "total_recipients": len(recipients),
            "volunteers": summary["volunteers"],
            "security": summary["security"],
            "residents": summary["residents"],
            "broadcast_started": True,
        }, status=status.HTTP_200_OK)


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = str(getattr(request.user, "role", "") or "").upper()
        unread_only = str(request.query_params.get("unread_only") or "").lower() in {"1", "true", "yes", "on"}
        base_qs = Notification.objects.all() if role == "ADMIN" else Notification.objects.filter(user__role="SECURITY") if role == "SECURITY" else Notification.objects.filter(user=request.user)
        notifications = base_qs.order_by("-created_at", "id")
        if unread_only:
            notifications = notifications.filter(read=False)
        data = []
        for item in notifications:
            deliveries = [
                {
                    "channel": delivery.channel,
                    "recipient": delivery.recipient,
                    "recipient_name": delivery.recipient_name,
                    "recipient_role": delivery.recipient_role,
                    "recipient_address": delivery.recipient_address,
                    "status": delivery.status,
                    "timestamp": delivery.timestamp.isoformat() if delivery.timestamp else None,
                }
                for delivery in item.deliveries.all()
            ]
            data.append(
                {
                    "id": item.id,
                    "title": item.title,
                    "body": item.body,
                    "message": item.body,
                    "kind": item.kind,
                    "read": item.read,
                    "data": item.data or {},
                    "received_at": item.received_at.isoformat() if item.received_at else None,
                    "created_at": item.created_at.isoformat() if item.created_at else None,
                    "deliveries": deliveries,
                }
            )
        return Response(data, status=status.HTTP_200_OK)


class NotificationTemplateListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Only admins should normally view templates in this app, but allow authenticated users to GET
        templates = NotificationTemplate.objects.filter(is_active=True).order_by("template_key")
        serializer = NotificationTemplateSerializer(templates, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        # create new template (Admin only)
        role = str(getattr(request.user, "role", "") or "").upper()
        if role != "ADMIN":
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        serializer = NotificationTemplateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class NotificationTemplateDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, key):
        try:
            return NotificationTemplate.objects.get(template_key=key)
        except NotificationTemplate.DoesNotExist:
            return None

    def get(self, request, key):
        obj = self.get_object(key)
        if not obj:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = NotificationTemplateSerializer(obj)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request, key):
        role = str(getattr(request.user, "role", "") or "").upper()
        if role != "ADMIN":
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        obj = self.get_object(key)
        if not obj:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = NotificationTemplateSerializer(obj, data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, key):
        role = str(getattr(request.user, "role", "") or "").upper()
        if role != "ADMIN":
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        obj = self.get_object(key)
        if not obj:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = NotificationTemplateSerializer(obj, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, key):
        role = str(getattr(request.user, "role", "") or "").upper()
        if role != "ADMIN":
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        obj = self.get_object(key)
        if not obj:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        obj.delete()
        return Response({"success": True}, status=status.HTTP_200_OK)


class ResetNotificationTemplatesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        role = str(getattr(request.user, "role", "") or "").upper()
        if role != "ADMIN":
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        defaults = [
            {"template_key": "sos_created", "name": "SOS Created", "channel": "PUSH", "subject": "SOS Created: {{incident_id}}", "title": "SOS Created", "body": "SOS reported by {{resident_name}}"},
            {"template_key": "sos_accepted", "name": "SOS Accepted", "channel": "PUSH", "subject": "SOS Accepted: {{incident_id}}", "title": "SOS Accepted", "body": "SOS accepted by {{volunteer_name}}"},
            {"template_key": "sos_resolved", "name": "SOS Resolved", "channel": "PUSH", "subject": "SOS Resolved: {{incident_id}}", "title": "SOS Resolved", "body": "SOS resolved for {{resident_name}}"},
            {"template_key": "escalation", "name": "Escalation", "channel": "SMS", "subject": "Escalation: {{incident_id}}", "title": "Escalation", "body": "Escalation notification: {{severity}}"},
            {"template_key": "emergency_contact_alert", "name": "Emergency Contact Alert", "channel": "SMS", "subject": "Emergency Contact Alert", "title": "Verify Contact", "body": "Please verify emergency contact for {{resident_name}}"},
            {"template_key": "community_broadcast", "name": "Community Broadcast", "channel": "EMAIL", "subject": "Community Broadcast", "title": "Community Broadcast", "body": "Community broadcast: {{category}} at {{address}}"},
        ]

        NotificationTemplate.objects.all().delete()
        created = []
        for item in defaults:
            obj = NotificationTemplate.objects.create(
                template_key=item["template_key"],
                name=item["name"],
                channel=item.get("channel", "EMAIL"),
                subject=item.get("subject", ""),
                title=item.get("title", ""),
                body=item.get("body", ""),
            )
            created.append(obj)

        serializer = NotificationTemplateSerializer(created, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request):
        """Delete all notification records. Admins only."""
        role = str(getattr(request.user, "role", "") or "").upper()
        if role != "ADMIN":
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        try:
            # Only delete Notification model records. Do not touch templates or related models.
            deleted_count, _ = Notification.objects.all().delete()
            return Response({"success": True, "deleted": deleted_count, "message": "Notification logs deleted."}, status=status.HTTP_200_OK)
        except Exception as exc:
            logger.exception("Failed to delete notification logs: %s", exc)
            return Response({"success": False, "message": "Unable to delete notification logs."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MarkNotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            notification = Notification.objects.get(id=pk, user=request.user)
        except Notification.DoesNotExist:
            return Response({"detail": "Notification not found"}, status=status.HTTP_404_NOT_FOUND)

        notification.read = True
        notification.save(update_fields=["read", "updated_at"])
        return Response({"success": True, "id": notification.id}, status=status.HTTP_200_OK)


class MarkAllNotificationsReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(user=request.user, read=False).update(read=True)
        return Response({"success": True, "updated": True}, status=status.HTTP_200_OK)


class NotificationDetailView(APIView):
    """Handle DELETE for a single notification.

    - 204 No Content on success
    - 404 if not found
    - 403 if user not allowed to delete
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            notification = Notification.objects.get(id=pk)
        except Notification.DoesNotExist:
            return Response({"detail": "Notification not found"}, status=status.HTTP_404_NOT_FOUND)

        # Allow owners to delete their own notifications
        if notification.user == request.user:
            notification.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # Allow admins to delete notifications they are authorized to manage
        user_role = getattr(request.user, "role", "").upper()
        if user_role == "ADMIN":
            notification.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
