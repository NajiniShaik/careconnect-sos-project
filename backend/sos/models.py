# Create your models here.
from django.db import models
from django.conf import settings
from django.utils import timezone


class SOS(models.Model):
    STATUS_CHOICES = [
        ("OPEN", "Open"),
        ("ACTIVE", "Active"),
        ("IN_PROGRESS", "In Progress"),
        ("ESCALATED", "Escalated"),
        ("RESOLVED", "Resolved"),
        ("CLOSED", "Closed"),
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
    closure_notes = models.TextField(blank=True, null=True)
    resolution_summary = models.TextField(blank=True, null=True)
    actions_taken = models.TextField(blank=True, null=True)
    additional_remarks = models.TextField(blank=True, null=True)
    closed_at = models.DateTimeField(blank=True, null=True)
    priority = models.CharField(
        max_length=20,
        choices=PRIORITY_CHOICES,
        default="HIGH"
    )

    # Assigned volunteer for the SOS. Null when unassigned.
    assigned_volunteer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_sos"
    )

    escalation_level = models.PositiveIntegerField(default=0)
    guardian_response_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"SOS({self.user.username}) - {self.status}"

    def can_transition_to(self, new_status: str) -> bool:
        """Return True if SOS can transition from current status to new_status.

        Allowed lifecycle (Day 15): OPEN -> ACTIVE -> ESCALATED -> RESOLVED -> CLOSED
        Also allow ADMIN to set IN_PROGRESS interchangeably with ACTIVE for compatibility.
        """
        if not new_status:
            return False

        stored_status = (self.status or "OPEN").upper()
        current = (self.get_current_lifecycle_status() or stored_status).upper()
        target = str(new_status).upper()

        if stored_status in {"RESOLVED", "CLOSED"}:
            effective_current = stored_status
        else:
            effective_current = {
                "TRIGGERED": "OPEN",
                "GUARDIAN_NOTIFIED": "OPEN",
                "GUARDIAN_RESPONDED": "OPEN",
                "VOLUNTEER_NOTIFIED": "OPEN",
                "VOLUNTEER_ACCEPTED": "ACTIVE",
                "SECURITY_NOTIFIED": "ACTIVE",
                "SECURITY_RESPONDED": "ACTIVE",
                "AUTO_ESCALATED": "ESCALATED",
                "INCIDENT_CLOSED": "CLOSED",
            }.get(current, current)

        if effective_current == target:
            return True

        # Define allowed forward-only transitions
        allowed = {
            "OPEN": {"ACTIVE", "IN_PROGRESS", "ESCALATED", "RESOLVED", "CLOSED"},
            "IN_PROGRESS": {"ACTIVE", "IN_PROGRESS", "ESCALATED", "RESOLVED", "CLOSED"},
            "ACTIVE": {"ACTIVE", "IN_PROGRESS", "ESCALATED", "RESOLVED", "CLOSED"},
            "ESCALATED": {"RESOLVED", "CLOSED"},
            "RESOLVED": {"CLOSED"},
            "CLOSED": set(),
        }

        return target in allowed.get(effective_current, set())

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


class ChatMessage(models.Model):
    incident = models.ForeignKey(SOS, on_delete=models.CASCADE, related_name="chat_messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_messages")
    message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(blank=True, null=True)
    is_system_message = models.BooleanField(default=False)

    class Meta:
        ordering = ("created_at", "id")

    def __str__(self):
        return f"ChatMessage({self.incident_id}) - {self.sender.username}"


class ResponseUpdate(models.Model):
    """Updates posted by responders/admins regarding an SOS incident."""
    incident = models.ForeignKey(SOS, on_delete=models.CASCADE, related_name="updates")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="response_updates")
    role = models.CharField(max_length=20)
    message = models.TextField(blank=True)
    update_type = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")

    def __str__(self):
        return f"ResponseUpdate({self.incident_id}) by {self.user.username}"