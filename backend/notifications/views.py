from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
import logging

from django.contrib.auth import get_user_model
from django.utils import timezone
from django.db.models import Q

from .models import DeviceToken, Notification, NotificationDelivery
from .serializers import RegisterDeviceSerializer

logger = logging.getLogger(__name__)


class RegisterDeviceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = RegisterDeviceSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": "Invalid data", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

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
