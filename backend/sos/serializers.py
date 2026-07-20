from rest_framework import serializers
from .models import SOS, SOSMessage


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
            raise serializers.ValidationError("Uploaded audio file is empty.")

        allowed_extensions = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".aiff", ".aif"}
        extension = value.name and value.name.lower().rsplit(".", 1)[-1]
        file_ext = f".{extension}" if extension else ""

        if value.content_type and not value.content_type.startswith("audio/"):
            raise serializers.ValidationError("Uploaded file must be an audio file.")

        if file_ext and file_ext not in allowed_extensions:
            raise serializers.ValidationError("Unsupported audio format.")

        return value