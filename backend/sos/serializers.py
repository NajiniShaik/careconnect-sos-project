from rest_framework import serializers
from .models import SOS


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
            "status",
            "created_at",
            "updated_at",
        )


class SOSStatusUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SOS
        fields = ("status",)

    def validate_status(self, value):
        if not isinstance(value, str):
            raise serializers.ValidationError("Status must be a string")

        normalized_value = value.upper()
        allowed_statuses = {"OPEN", "IN_PROGRESS", "RESOLVED"}
        if normalized_value not in allowed_statuses:
            raise serializers.ValidationError("Status must be one of OPEN, IN_PROGRESS, or RESOLVED")
        return normalized_value