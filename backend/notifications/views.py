from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.db import transaction
from django.shortcuts import get_object_or_404
import logging

from .models import DeviceToken
from .serializers import RegisterDeviceSerializer, DeviceTokenSerializer

logger = logging.getLogger(__name__)


class RegisterDeviceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = RegisterDeviceSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": "Invalid data", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        token = serializer.validated_data.get("token")
        platform = serializer.validated_data.get("platform") or "unknown"
        device_id = serializer.validated_data.get("device_id") or None

        # Ignore blank tokens
        if not token:
            return Response({"success": False, "message": "Token cannot be blank"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                # If token exists for another user, ignore to avoid ownership issues
                existing_other = DeviceToken.objects.filter(token=token).exclude(user=request.user).first()
                if existing_other:
                    logger.warning("Device token already exists for another user; ignoring registration: %s", token)
                    return Response({"success": True, "message": "Token ignored (already registered)"}, status=status.HTTP_200_OK)

                # Find existing by user+device_id or user+token
                existing = None
                if device_id:
                    existing = DeviceToken.objects.filter(user=request.user, device_id=device_id).first()
                if not existing:
                    existing = DeviceToken.objects.filter(user=request.user, token=token).first()

                if existing:
                    # Update platform and token if changed
                    changed = False
                    if existing.token != token:
                        existing.token = token
                        changed = True
                    if existing.platform != platform:
                        existing.platform = platform
                        changed = True
                    if device_id and existing.device_id != device_id:
                        existing.device_id = device_id
                        changed = True
                    if changed:
                        existing.save()
                    data = DeviceTokenSerializer(existing).data
                    return Response({"success": True, "message": "Device token updated", "data": data}, status=status.HTTP_200_OK)

                # Create new token for this user
                new_token = DeviceToken.objects.create(user=request.user, token=token, platform=platform, device_id=device_id)
                data = DeviceTokenSerializer(new_token).data
                return Response({"success": True, "message": "Device token registered successfully.", "data": data}, status=status.HTTP_201_CREATED)
        except Exception as exc:
            logger.exception("Failed to register device token: %s", exc)
            return Response({"success": False, "message": "Unable to register device token."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def delete(self, request):
        token = request.data.get("token") or request.query_params.get("token")
        try:
            if token:
                deleted, _ = DeviceToken.objects.filter(user=request.user, token=token).delete()
            else:
                # Delete all tokens for user
                deleted, _ = DeviceToken.objects.filter(user=request.user).delete()

            return Response({"success": True, "message": "Device token(s) removed."}, status=status.HTTP_200_OK)
        except Exception as exc:
            logger.exception("Failed to remove device token: %s", exc)
            return Response({"success": False, "message": "Unable to remove device token(s)."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
from django.shortcuts import render

# Create your views here.
