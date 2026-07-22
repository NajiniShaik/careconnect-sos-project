from rest_framework import serializers
from .models import DeviceToken


class DeviceTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceToken
        fields = ("id", "token", "platform", "device_id", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class RegisterDeviceSerializer(serializers.Serializer):
    device_token = serializers.CharField(max_length=255, required=False, allow_blank=False)
    token = serializers.CharField(max_length=255, required=False, allow_blank=False)
    platform = serializers.ChoiceField(choices=[c[0] for c in DeviceToken.PLATFORM_CHOICES], required=False, default="unknown")
    device_id = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)

    def validate(self, data):
        token_value = data.get("device_token") or data.get("token")
        if not token_value or not str(token_value).strip():
            raise serializers.ValidationError({"device_token": "Token cannot be blank"})
        data["device_token"] = str(token_value).strip()
        return data
