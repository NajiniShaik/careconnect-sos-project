# Create your models here.
from django.db import models
from django.conf import settings
from django.utils import timezone


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
    transcript = models.TextField(blank=True, default="")
    transcription_status = models.CharField(max_length=20, default="PENDING")
    transcription_completed_at = models.DateTimeField(blank=True, null=True)

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

    escalation_level = models.PositiveIntegerField(default=0)
    guardian_response_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"SOS({self.user.username}) - {self.status}"

    def record_status_event(self, status, details="", occurred_at=None):
        event = SOSStatusEvent.objects.create(
            sos=self,
            status=status,
            details=details,
            occurred_at=occurred_at or timezone.now(),
        )
        self.save(update_fields=["updated_at"])
        return event

    def get_current_lifecycle_status(self):
        latest_event = self.status_events.order_by("-occurred_at", "-id").first()
        return latest_event.status if latest_event else self.status

    def get_status_timeline(self):
        return list(self.status_events.order_by("occurred_at", "id"))


class SOSStatusEvent(models.Model):
    STATUS_CHOICES = [
        ("TRIGGERED", "Triggered"),
        ("GUARDIAN_NOTIFIED", "Guardian Notified"),
        ("GUARDIAN_RESPONDED", "Guardian Responded"),
        ("AUTO_ESCALATED", "Auto Escalated"),
        ("VOLUNTEER_NOTIFIED", "Volunteer Notified"),
        ("VOLUNTEER_ACCEPTED", "Volunteer Accepted"),
        ("SECURITY_NOTIFIED", "Security Notified"),
        ("SECURITY_RESPONDED", "Security Responded"),
        ("INCIDENT_CLOSED", "Incident Closed"),
    ]

    sos = models.ForeignKey(SOS, on_delete=models.CASCADE, related_name="status_events")
    status = models.CharField(max_length=30, choices=STATUS_CHOICES)
    details = models.TextField(blank=True, default="")
    occurred_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("occurred_at", "id")

    def __str__(self):
        return f"{self.sos_id}:{self.status}"


class SOSMessage(models.Model):
    sos = models.ForeignKey(SOS, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sos_messages")
    message = models.TextField(blank=True)
    audio_file = models.FileField(upload_to="sos_audio/%Y/%m/%d/", blank=True, null=True)
    transcript = models.TextField(blank=True, default="")
    transcription_status = models.CharField(max_length=20, default="PENDING")
    transcription_completed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")

    def __str__(self):
        return f"SOSMessage({self.sos_id}) - {self.sender.username}"