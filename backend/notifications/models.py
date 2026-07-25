from django.conf import settings
from django.db import models


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
    notification = models.ForeignKey(Notification, on_delete=models.CASCADE, related_name="deliveries")
    channel = models.CharField(max_length=20, default="Email")
    recipient = models.CharField(max_length=255, blank=True)
    recipient_name = models.CharField(max_length=255, blank=True)
    recipient_role = models.CharField(max_length=50, blank=True)
    recipient_address = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, default="Pending")
    timestamp = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["timestamp", "id"]

    def __str__(self):
        return f"{self.channel} -> {self.recipient or '-'} ({self.status})"


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
