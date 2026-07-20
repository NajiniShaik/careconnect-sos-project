from django.conf import settings
from django.db import models


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
