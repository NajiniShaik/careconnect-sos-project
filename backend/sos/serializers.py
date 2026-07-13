from rest_framework import serializers
from .models import SOS


class SOSSerializer(serializers.ModelSerializer):
    user = serializers.StringRelatedField()

    class Meta:
        model = SOS
        fields = (
            "id",
            "user",
            "message",
            "location",
            "status",
            "created_at",
            "updated_at",
        )