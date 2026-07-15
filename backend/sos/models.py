# Create your models here.
from django.db import models
from django.conf import settings


class SOS(models.Model):
    STATUS_CHOICES = [
        ("OPEN", "Open"),
        ("ACTIVE", "Active"),
        ("IN_PROGRESS", "In Progress"),
        ("RESOLVED", "Resolved"),
        ("ESCALATED", "Escalated"),
    ]

    PRIORITY_CHOICES = [
        ("LOW", "Low"),
        ("MEDIUM", "Medium"),
        ("HIGH", "High"),
        ("CRITICAL", "Critical"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sos_requests"
    )

    message = models.TextField(blank=True, null=True)
    location = models.CharField(max_length=255, blank=True, null=True)
    category = models.CharField(max_length=30, blank=True, null=True)
    latitude = models.FloatField(blank=True, null=True)
    longitude = models.FloatField(blank=True, null=True)
    address = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)
    country = models.CharField(max_length=100, blank=True, null=True)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="OPEN"
    )
    priority = models.CharField(
        max_length=20,
        choices=PRIORITY_CHOICES,
        default="HIGH"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"SOS({self.user.username}) - {self.status}"


class SOSMessage(models.Model):
    sos = models.ForeignKey(SOS, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sos_messages")
    message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")

    def __str__(self):
        return f"SOSMessage({self.sos_id}) - {self.sender.username}"