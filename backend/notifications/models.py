from django.conf import settings
from django.db import models


class EscalationConfiguration(models.Model):
    response_timeout_minutes = models.PositiveIntegerField(default=5)
    escalation_enabled = models.BooleanField(default=True)
    escalate_to_secondary_guardian = models.BooleanField(default=True)
    escalate_to_emergency_contacts = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Escalation Configuration"
        verbose_name_plural = "Escalation Configurations"

    def save(self, *args, **kwargs):
        if self.pk:
            super().save(*args, **kwargs)
            return

        if EscalationConfiguration.objects.exists():
            raise ValueError("Only one escalation configuration can exist")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Escalation Configuration ({self.response_timeout_minutes}m)"


class EscalationLog(models.Model):
    class EscalationLevel(models.TextChoices):
        SECONDARY_GUARDIAN = "SECONDARY_GUARDIAN", "Secondary Guardian"
        EMERGENCY_CONTACT = "EMERGENCY_CONTACT", "Emergency Contact"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SENT = "SENT", "Sent"
        FAILED = "FAILED", "Failed"

    sos = models.ForeignKey("sos.SOS", on_delete=models.CASCADE, related_name="escalation_logs")
    escalation_level = models.CharField(max_length=30, choices=EscalationLevel.choices)
    recipient_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="escalation_logs")
    recipient_contact = models.CharField(max_length=255, blank=True, default="")
    escalation_reason = models.CharField(max_length=255, blank=True, default="")
    response_timeout_minutes = models.PositiveIntegerField(default=0)
    timestamp = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp", "-id"]
        indexes = [
            models.Index(fields=("sos", "status", "timestamp")),
            models.Index(fields=("escalation_level", "status", "timestamp")),
        ]

    def __str__(self):
        return f"EscalationLog({self.sos_id}:{self.escalation_level})"


class Notification(models.Model):
    KIND_CHOICES = (
        ("SOS", "SOS"),
        ("ANNOUNCEMENT", "Announcement"),
        ("SOCIETY_UPDATE", "Society Update"),
        ("GENERAL", "General"),
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    kind = models.CharField(max_length=30, choices=KIND_CHOICES, default="GENERAL")
    read = models.BooleanField(default=False)
    data = models.JSONField(default=dict, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "id"]
        indexes = [models.Index(fields=("user", "read", "created_at"))]

    def __str__(self):
        return f"{self.user} - {self.title}"


class NotificationDelivery(models.Model):
    CHANNEL_CHOICES = (
        ("Push", "Push"),
        ("SMS", "SMS"),
        ("Email", "Email"),
    )
    STATUS_CHOICES = (
        ("Pending", "Pending"),
        ("Sent", "Sent"),
        ("Delivered", "Delivered"),
        ("Failed", "Failed"),
    )

    notification = models.ForeignKey(Notification, on_delete=models.CASCADE, related_name="deliveries")
    notification_type = models.CharField(max_length=30, blank=True, default="")
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES, default="Email")
    recipient = models.CharField(max_length=255, blank=True)
    recipient_name = models.CharField(max_length=255, blank=True)
    recipient_role = models.CharField(max_length=50, blank=True)
    recipient_address = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="Pending")
    failure_reason = models.TextField(blank=True, default="")
    retry_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(blank=True, null=True)
    delivered_at = models.DateTimeField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["timestamp", "id"]

    def __str__(self):
        return f"{self.channel} -> {self.recipient or '-'} ({self.status})"


class CommunityBroadcastLog(models.Model):
    sos = models.ForeignKey("sos.SOS", on_delete=models.CASCADE, related_name="community_broadcast_logs")
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="community_broadcast_logs")
    role = models.CharField(max_length=30, blank=True, default="")
    delivery_channel = models.CharField(max_length=30, blank=True, default="")
    queued_at = models.DateTimeField(auto_now_add=True)
    delivery_status = models.CharField(max_length=20, default="QUEUED")
    recipient_contact = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-queued_at", "-id"]
        indexes = [models.Index(fields=("sos", "delivery_status", "queued_at"))]

    def __str__(self):
        return f"BroadcastLog({self.sos_id}:{self.recipient_id}:{self.delivery_channel})"


class DeviceToken(models.Model):
	PLATFORM_CHOICES = (
		("android", "Android"),
		("ios", "iOS"),
		("web", "Web"),
		("unknown", "Unknown"),
	)

	user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="device_tokens")
	token = models.CharField(max_length=255, db_index=True)
	platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES, default="unknown")
	device_id = models.CharField(max_length=255, blank=True, null=True, help_text="Optional device identifier")
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		unique_together = (("user", "device_id"), ("user", "token"))
		indexes = [models.Index(fields=("token",))]

	def __str__(self):
		return f"{self.user} - {self.platform} - {self.device_id or self.token[:8]}"
