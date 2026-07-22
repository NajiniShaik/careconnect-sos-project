from django.db import transaction
from django.shortcuts import render 
from .serializers import SOSSerializer, SOSStatusUpdateSerializer, SOSResidentUpdateSerializer, SOSMessageCreateSerializer, SOSMessageSerializer, SpeechToTextSerializer

# Create your views here.
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from .models import SOS, SOSMessage
from . import transcription as transcription_module
from .transcription import enqueue_transcription
from .utils import reverse_geocode_coordinates
from users.permissions import IsAdmin, IsResident, IsSecurity
from django.contrib.auth import get_user_model
from notifications.services import NotificationService
from notifications.models import DeviceToken
import logging
from typing import List



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

        # Trigger notifications (best-effort). Do not let notification
        # failures affect the core SOS creation flow.
        try:
            User = get_user_model()
            notif = NotificationService()

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
            admin_qs = None
            try:
                admin_qs = User.objects.filter(role__in=["ADMIN", "SECURITY"])
                if society_name:
                    admin_qs = admin_qs.filter(resident_profile__society__name=society_name)
                admin_emails = [u.email for u in admin_qs if u.email]
            except Exception:
                admin_emails = []

            # SMS recipients: admins/security plus emergency contacts
            sms_numbers = []
            try:
                if admin_qs is not None:
                    sms_numbers.extend([u.phone for u in admin_qs if getattr(u, "phone", None)])
            except Exception:
                pass

            try:
                profile = getattr(request.user, "resident_profile", None)
                if profile:
                    for ec in getattr(profile, "emergency_contacts", []).all():
                        if getattr(ec, "phone", None):
                            sms_numbers.append(ec.phone)
            except Exception:
                pass

            sms_numbers = [str(num).strip() for num in set(sms_numbers) if num and str(num).strip()]

            device_tokens: List[str] = []
            try:
                admin_qs = User.objects.filter(role__in=["ADMIN", "SECURITY"])
                if society_name:
                    admin_qs = admin_qs.filter(resident_profile__society__name=society_name)

                profile_tokens = [u.device_token for u in admin_qs if getattr(u, "device_token", None)]
                record_tokens = []
                try:
                    record_tokens = list(DeviceToken.objects.filter(user__in=admin_qs).values_list("token", flat=True))
                except Exception:
                    record_tokens = []

                device_tokens = [t for t in set(profile_tokens + [t for t in record_tokens if t]) if t]
            except Exception:
                device_tokens = []

            # Fire off notifications (best-effort)
            try:
                if device_tokens:
                    notif.send_push_notification(
                        device_tokens,
                        "Emergency SOS Alert",
                        f"{resident_name} has triggered an SOS.",
                        data={
                            "type": "SOS",
                            "alert_id": str(sos.id),
                            "resident_id": str(request.user.id),
                        },
                    )
            except Exception:
                logger = logging.getLogger(__name__)
                logger.exception("Failed to send SOS push notifications")

            try:
                if admin_emails:
                    notif.send_email_notification(admin_emails, "SOS Alert: %s" % (sos.category or "SOS"), "notifications/sos_notification", context)
            except Exception:
                logger = logging.getLogger(__name__)
                logger.exception("Failed to send SOS email notifications")

            try:
                if sms_numbers:
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

                    notif.send_sms_notification(sms_numbers, sms_message)
            except Exception:
                logger = logging.getLogger(__name__)
                logger.exception("Failed to send SOS SMS notifications")

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
                        notif.send_email_notification(
                            contact_emails,
                            "Emergency SOS Alert",
                            "notifications/emergency_contact_notification",
                            {**context, "contact_name": "Emergency Contact"},
                        )
                    except Exception:
                        logger = logging.getLogger(__name__)
                        logger.exception("Failed to send SOS emails to emergency contacts")
            except Exception:
                # Ensure any email-related errors do not interrupt SOS creation
                logger = logging.getLogger(__name__)
                logger.exception("Unexpected error while sending emergency contact emails")
        except Exception:
            # Ensure notifications cannot break the primary flow
            import logging as _logging
            _logging.getLogger(__name__).exception("Unexpected error while triggering notifications")

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


class SOSAlertManagementView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
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
                return Response(SOSSerializer(sos, context={"request": request}).data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

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