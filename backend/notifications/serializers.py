from rest_framework import serializers
from .models import DeviceToken


class DeviceTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceToken
        fields = ("id", "token", "platform", "device_id", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class RegisterDeviceSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=255, required=True)
    platform = serializers.ChoiceField(choices=[c[0] for c in DeviceToken.PLATFORM_CHOICES], required=False, default="unknown")
    device_id = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)

    def validate_token(self, value):
        if not value or not str(value).strip():
            raise serializers.ValidationError("Token cannot be blank")
        return value.strip()
