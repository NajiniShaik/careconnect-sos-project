from rest_framework import serializers
from .models import SOS, SOSMessage


class UserSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)
    role = serializers.CharField(read_only=True)


class SOSSerializer(serializers.ModelSerializer):
    user = UserSummarySerializer(read_only=True)

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
            "created_at",
            "updated_at",
        )


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

    class Meta:
        model = SOSMessage
        fields = ("id", "sos", "sender", "message", "created_at")
        read_only_fields = ("id", "sos", "sender", "created_at")


class SOSMessageCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SOSMessage
        fields = ("message",)

    def validate_message(self, value):
        if not isinstance(value, str):
            raise serializers.ValidationError("Message must be a string")

        normalized_value = value.strip()
        if not normalized_value:
            raise serializers.ValidationError("Message cannot be empty")
        return normalized_value