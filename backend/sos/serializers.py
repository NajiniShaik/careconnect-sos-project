from django.utils import timezone
from rest_framework import serializers
from .models import SOS, SOSMessage, SOSStatusEvent


class UserSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)
    role = serializers.CharField(read_only=True)


class SOSSerializer(serializers.ModelSerializer):
    user = UserSummarySerializer(read_only=True)
    audio_url = serializers.SerializerMethodField()
    transcript = serializers.SerializerMethodField()
    transcription_status = serializers.SerializerMethodField()
    transcription_completed_at = serializers.SerializerMethodField()

    class Meta:
        model = SOS
        fields = (
            "id",
            "user",
            "message",
            "location",
            "category",
            "latitude",
            "longitude",
            "address",
            "city",
            "state",
            "country",
            "status",
            "priority",
            "transcript",
            "transcription_status",
            "transcription_completed_at",
            "audio_url",
            "created_at",
            "updated_at",
        )

    def _get_latest_message(self, obj):
        return obj.messages.filter(audio_file__isnull=False).order_by("-created_at", "-id").first()

    def get_audio_url(self, obj):
        message = self._get_latest_message(obj)
        if not message or not message.audio_file:
            return None

        request = self.context.get("request")
        if request is not None:
            return request.build_absolute_uri(message.audio_file.url)
        return message.audio_file.url

    def get_transcript(self, obj):
        message = self._get_latest_message(obj)
        return message.transcript if message else obj.transcript

    def get_transcription_status(self, obj):
        message = self._get_latest_message(obj)
        return message.transcription_status if message else obj.transcription_status

    def get_transcription_completed_at(self, obj):
        message = self._get_latest_message(obj)
        return message.transcription_completed_at if message else obj.transcription_completed_at


class SOSStatusUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SOS
        fields = ("status", "priority")

    def validate_status(self, value):
        if not isinstance(value, str):
            raise serializers.ValidationError("Status must be a string")

        normalized_value = value.upper()
        allowed_statuses = {"OPEN", "IN_PROGRESS", "RESOLVED"}
        if normalized_value not in allowed_statuses:
            raise serializers.ValidationError("Status must be one of OPEN, IN_PROGRESS, or RESOLVED")
        return normalized_value

    def validate_priority(self, value):
        if value is None:
            return value

        if not isinstance(value, str):
            raise serializers.ValidationError("Priority must be a string")

        normalized_value = value.upper()
        allowed_priorities = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
        if normalized_value not in allowed_priorities:
            raise serializers.ValidationError("Priority must be one of LOW, MEDIUM, HIGH, or CRITICAL")
        return normalized_value


class SOSResidentUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SOS
        fields = ("message", "latitude", "longitude", "priority")

    def validate_message(self, value):
        if value is None:
            return value

        if not isinstance(value, str):
            raise serializers.ValidationError("Message must be a string")

        normalized_value = value.strip()
        if not normalized_value:
            raise serializers.ValidationError("Message cannot be empty")
        return normalized_value

    def validate_latitude(self, value):
        if value in [None, ""]:
            return None

        if not isinstance(value, (int, float)):
            raise serializers.ValidationError("Latitude must be a number")
        return value

    def validate_longitude(self, value):
        if value in [None, ""]:
            return None

        if not isinstance(value, (int, float)):
            raise serializers.ValidationError("Longitude must be a number")
        return value

    def validate_priority(self, value):
        if value is None:
            return value

        if not isinstance(value, str):
            raise serializers.ValidationError("Priority must be a string")

        normalized_value = value.upper()
        allowed_priorities = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
        if normalized_value not in allowed_priorities:
            raise serializers.ValidationError("Priority must be one of LOW, MEDIUM, HIGH, or CRITICAL")
        return normalized_value


class SOSStatusEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = SOSStatusEvent
        fields = ("status", "details", "occurred_at")


class SOSStatusDetailSerializer(serializers.ModelSerializer):
    current_status = serializers.SerializerMethodField()
    timeline = serializers.SerializerMethodField()
    response_duration_seconds = serializers.SerializerMethodField()

    class Meta:
        model = SOS
        fields = ("id", "current_status", "timeline", "response_duration_seconds")

    def get_current_status(self, obj):
        return obj.get_current_lifecycle_status()

    def get_timeline(self, obj):
        return SOSStatusEventSerializer(obj.get_status_timeline(), many=True).data

    def get_response_duration_seconds(self, obj):
        latest_event = obj.status_events.order_by("-occurred_at", "-id").first()
        if not latest_event or not obj.created_at:
            return None
        delta = latest_event.occurred_at - obj.created_at
        return int(delta.total_seconds()) if delta.total_seconds() >= 0 else None


class SOSStatusListItemSerializer(serializers.ModelSerializer):
    incident_id = serializers.IntegerField(source="id", read_only=True)
    resident = serializers.SerializerMethodField()
    society = serializers.SerializerMethodField()
    current_status = serializers.SerializerMethodField()
    latest_event_at = serializers.SerializerMethodField()

    class Meta:
        model = SOS
        fields = ("incident_id", "resident", "society", "current_status", "latest_event_at", "created_at", "updated_at")

    def get_resident(self, obj):
        user = getattr(obj, "user", None)
        return {"id": getattr(user, "id", None), "username": getattr(user, "username", None)} if user else None

    def get_society(self, obj):
        profile = getattr(getattr(obj.user, "resident_profile", None), "society", None)
        return getattr(profile, "name", None)

    def get_current_status(self, obj):
        return obj.get_current_lifecycle_status()

    def get_latest_event_at(self, obj):
        latest_event = obj.status_events.order_by("-occurred_at", "-id").first()
        return latest_event.occurred_at if latest_event else obj.updated_at


class SOSResponseMonitoringSerializer(serializers.ModelSerializer):
    incident_id = serializers.IntegerField(source="id", read_only=True)
    resident = serializers.SerializerMethodField()
    society = serializers.SerializerMethodField()
    current_stage = serializers.SerializerMethodField()
    active = serializers.SerializerMethodField()
    response_durations = serializers.SerializerMethodField()
    timeline = serializers.SerializerMethodField()
    status_history = serializers.SerializerMethodField()
    escalation_history = serializers.SerializerMethodField()
    notification_summary = serializers.SerializerMethodField()
    current_state = serializers.SerializerMethodField()

    class Meta:
        model = SOS
        fields = (
            "incident_id",
            "resident",
            "society",
            "category",
            "message",
            "location",
            "status",
            "current_stage",
            "active",
            "response_durations",
            "timeline",
            "status_history",
            "escalation_history",
            "notification_summary",
            "current_state",
            "created_at",
            "updated_at",
        )

    def get_resident(self, obj):
        user = getattr(obj, "user", None)
        return {"id": getattr(user, "id", None), "username": getattr(user, "username", None), "role": getattr(user, "role", None)} if user else None

    def get_society(self, obj):
        profile = getattr(getattr(obj.user, "resident_profile", None), "society", None)
        return getattr(profile, "name", None)

    def get_current_stage(self, obj):
        return self._get_current_stage(obj)

    def get_active(self, obj):
        return self._get_current_stage(obj) != "Closed"

    def get_response_durations(self, obj):
        return self._get_response_durations(obj)

    def get_timeline(self, obj):
        return SOSStatusEventSerializer(obj.get_status_timeline(), many=True).data

    def get_status_history(self, obj):
        return SOSStatusEventSerializer(obj.get_status_timeline(), many=True).data

    def get_escalation_history(self, obj):
        from notifications.models import EscalationLog

        logs = EscalationLog.objects.filter(sos=obj).order_by("timestamp", "id")
        return [
            {
                "id": log.id,
                "escalation_level": log.escalation_level,
                "status": log.status,
                "recipient_contact": log.recipient_contact,
                "escalation_reason": log.escalation_reason,
                "timestamp": log.timestamp,
            }
            for log in logs
        ]

    def get_notification_summary(self, obj):
        from notifications.models import Notification, NotificationDelivery

        notifications = Notification.objects.filter(user=obj.user).order_by("-created_at")
        summary = {
            "total_notifications": notifications.count(),
            "total_deliveries": NotificationDelivery.objects.filter(notification__user=obj.user).count(),
            "channels": list(NotificationDelivery.objects.filter(notification__user=obj.user).values_list("channel", flat=True).distinct()),
        }
        return summary

    def get_current_state(self, obj):
        return {
            "current_status": obj.get_current_lifecycle_status(),
            "current_stage": self._get_current_stage(obj),
            "active": self._get_current_stage(obj) != "Closed",
        }

    def _get_current_stage(self, obj):
        latest_status = obj.get_current_lifecycle_status()
        if latest_status == "INCIDENT_CLOSED":
            return "Closed"
        if latest_status == "GUARDIAN_RESPONDED":
            return "Waiting for Volunteer"
        if latest_status == "VOLUNTEER_ACCEPTED":
            return "Waiting for Security"
        if latest_status == "SECURITY_RESPONDED":
            return "Closed"
        if latest_status in {"GUARDIAN_NOTIFIED", "AUTO_ESCALATED"}:
            return "Waiting for Guardian"
        if latest_status in {"VOLUNTEER_NOTIFIED"}:
            return "Waiting for Volunteer"
        if latest_status in {"SECURITY_NOTIFIED"}:
            return "Waiting for Security"
        if obj.status == "ESCALATED":
            return "Escalated"
        return "Active"

    def _get_response_durations(self, obj):
        timeline = list(obj.get_status_timeline())
        created_at = obj.created_at
        if created_at is None:
            created_at = timezone.now()

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

        if guardian_response_seconds is None and timeline:
            guardian_response_seconds = int((timezone.now() - created_at).total_seconds())
        if volunteer_response_seconds is None and guardian_response_seconds is not None and timeline:
            volunteer_response_seconds = int((timezone.now() - created_at).total_seconds())
        if security_response_seconds is None and volunteer_response_seconds is not None and timeline:
            security_response_seconds = int((timezone.now() - created_at).total_seconds())

        return {
            "alert_trigger_time_seconds": 0,
            "guardian_response_time_seconds": guardian_response_seconds,
            "volunteer_response_time_seconds": volunteer_response_seconds,
            "security_response_time_seconds": security_response_seconds,
            "total_resolution_time_seconds": total_resolution_seconds,
            "current_active_duration_seconds": int((timezone.now() - created_at).total_seconds()),
        }


class SOSMessageSerializer(serializers.ModelSerializer):
    sender = UserSummarySerializer(read_only=True)
    audio_url = serializers.SerializerMethodField()

    class Meta:
        model = SOSMessage
        fields = ("id", "sos", "sender", "message", "audio_url", "transcript", "transcription_status", "transcription_completed_at", "created_at")
        read_only_fields = ("id", "sos", "sender", "audio_url", "transcript", "transcription_status", "transcription_completed_at", "created_at")

    def get_audio_url(self, obj):
        if not obj.audio_file:
            return None

        request = self.context.get("request")
        if request is not None:
            return request.build_absolute_uri(obj.audio_file.url)
        return obj.audio_file.url


class SOSMessageCreateSerializer(serializers.ModelSerializer):
    audio = serializers.FileField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = SOSMessage
        fields = ("message", "audio")

    def validate_message(self, value):
        if value is None:
            return ""

        if not isinstance(value, str):
            raise serializers.ValidationError("Message must be a string")

        return value.strip()

    def validate(self, attrs):
        message = attrs.get("message", "") or ""
        audio = attrs.get("audio")

        if not message.strip() and not audio:
            raise serializers.ValidationError("Either a message or an audio attachment is required")

        return attrs


class SpeechToTextSerializer(serializers.Serializer):
    audio = serializers.FileField(allow_empty_file=True)

    def validate_audio(self, value):
        if value.size == 0:
            raise serializers.ValidationError("The submitted file is empty.")

        allowed_extensions = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".aiff", ".aif"}
        extension = value.name and value.name.lower().rsplit(".", 1)[-1]
        file_ext = f".{extension}" if extension else ""

        if value.content_type and not value.content_type.startswith("audio/"):
            raise serializers.ValidationError("Uploaded file must be an audio file.")

        if file_ext and file_ext not in allowed_extensions:
            raise serializers.ValidationError("Unsupported audio format.")

        return value