from rest_framework import serializers
from .models import DeviceToken, EscalationConfiguration, EscalationLog, NotificationDelivery
from .models import NotificationTemplate


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


class EscalationLogSerializer(serializers.ModelSerializer):
    sos = serializers.IntegerField(read_only=True, source="sos_id")
    recipient_user = serializers.SerializerMethodField()

    class Meta:
        model = EscalationLog
        fields = (
            "id",
            "sos",
            "escalation_level",
            "recipient_user",
            "recipient_contact",
            "escalation_reason",
            "response_timeout_minutes",
            "timestamp",
            "status",
            "created_at",
        )
        read_only_fields = ("id", "sos", "recipient_user", "timestamp", "created_at")

    def get_recipient_user(self, obj):
        if obj.recipient_user_id is None:
            return None
        return {
            "id": obj.recipient_user_id,
            "username": getattr(obj.recipient_user, "username", None),
            "email": getattr(obj.recipient_user, "email", None),
            "role": getattr(obj.recipient_user, "role", None),
        }


class NotificationDeliverySerializer(serializers.ModelSerializer):
    notification_id = serializers.IntegerField(read_only=True)
    notification_type = serializers.CharField(read_only=True)

    class Meta:
        model = NotificationDelivery
        fields = (
            "id",
            "notification_id",
            "notification_type",
            "channel",
            "recipient",
            "recipient_name",
            "recipient_role",
            "recipient_address",
            "status",
            "failure_reason",
            "retry_count",
            "created_at",
            "sent_at",
            "delivered_at",
            "updated_at",
        )
        read_only_fields = fields


class EscalationConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = EscalationConfiguration
        fields = (
            "id",
            "response_timeout_minutes",
            "escalation_enabled",
            "escalate_to_secondary_guardian",
            "escalate_to_emergency_contacts",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_response_timeout_minutes(self, value):
        if value <= 0:
            raise serializers.ValidationError("Response timeout must be greater than 0")
        return value


class NotificationTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationTemplate
        fields = (
            "id",
            "name",
            "template_key",
            "channel",
            "subject",
            "title",
            "body",
            "variables",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
