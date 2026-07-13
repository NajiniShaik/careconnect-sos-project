from django.db import models
from django.contrib.auth.models import AbstractUser
from society.models import Society, Block, Flat

class User(AbstractUser):
    class Role(models.TextChoices):
        RESIDENT = "RESIDENT", "Resident"
        GUARDIAN = "GUARDIAN", "Guardian"
        VOLUNTEER = "VOLUNTEER", "Volunteer"
        SECURITY = "SECURITY", "Security"
        ADMIN = "ADMIN", "Admin"

    role = models.CharField(max_length=20, choices=Role.choices)
    phone = models.CharField(max_length=15, blank=True, null=True)
    is_verified = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.username} - {self.role}"


class ResidentProfile(models.Model):

    class ApprovalStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="resident_profile"
    )

    society = models.ForeignKey(
        Society,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="residents"
    )

    block = models.ForeignKey(
        Block,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="residents"
    )

    flat = models.ForeignKey(
        Flat,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="residents"
    )

    approval_status = models.CharField(
        max_length=20,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.PENDING
    )

    def __str__(self):
        return self.user.username


class GuardianProfile(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="guardian_profile"
    )
    resident_name = models.CharField(max_length=100)
    relationship = models.CharField(max_length=50)

    def __str__(self):
        return self.user.username


class VolunteerProfile(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="volunteer_profile"
    )
    skills = models.CharField(max_length=255)
    availability = models.CharField(max_length=100)

    def __str__(self):
        return self.user.username


class SecurityProfile(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="security_profile"
    )
    employee_id = models.CharField(max_length=50)
    shift = models.CharField(max_length=50)

    def __str__(self):
        return self.user.username 
    

class EmergencyContact(models.Model):
    class ContactType(models.TextChoices):
        PRIMARY_GUARDIAN = "PRIMARY_GUARDIAN", "Primary Guardian"
        SECONDARY_GUARDIAN = "SECONDARY_GUARDIAN", "Secondary Guardian"
        EMERGENCY_CONTACT = "EMERGENCY_CONTACT", "Emergency Contact"

    resident = models.ForeignKey(
        ResidentProfile,
        on_delete=models.CASCADE,
        related_name="emergency_contacts",
    )

    name = models.CharField(max_length=100)

    phone = models.CharField(max_length=15)

    relationship = models.CharField(max_length=50)

    contact_type = models.CharField(
        max_length=25,
        choices=ContactType.choices,
        default=ContactType.EMERGENCY_CONTACT,
    )

    is_verified = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.name} ({self.contact_type})"
    

