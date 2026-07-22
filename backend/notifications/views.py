from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
import logging

from .models import DeviceToken
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
            request.user.device_token = device_token
            request.user.save(update_fields=["device_token"])
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
