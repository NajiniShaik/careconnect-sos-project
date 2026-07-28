import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from notifications.models import EscalationConfiguration, EscalationLog, Notification, NotificationDelivery
from notifications.services import NotificationService
from .community_broadcast import CommunityBroadcastService
from sos.models import SOS
from users.models import EmergencyContact, GuardianProfile

logger = logging.getLogger(__name__)


def _mask_token(token):
    if not token:
        return ""
    token_text = str(token)
    if len(token_text) <= 8:
        return token_text
    return f"{token_text[:8]}...{token_text[-4:]}"


def _get_recipient_identity(notification):
    if not notification:
        return "", ""

    user = getattr(notification, "user", None)
    display_name = ""
    try:
        display_name = user.get_full_name() or user.username or ""
    except Exception:
        display_name = getattr(user, "username", "") or ""

    role = getattr(user, "role", "") or ""
    return display_name, role


def _get_escalation_configuration():
    config = EscalationConfiguration.objects.order_by("-updated_at", "-created_at").first()
    if config is None:
        config = EscalationConfiguration.objects.create()
    return config


def _get_secondary_guardian_user(resident_user):
    if resident_user is None:
        return None

    try:
        guardian_profile = GuardianProfile.objects.filter(resident_name__iexact=getattr(resident_user, "username", "")).first()
        if guardian_profile is not None:
            return guardian_profile.user
    except Exception:
        return None

    return None


def _get_emergency_contacts(resident_user):
    profile = getattr(resident_user, "resident_profile", None)
    if profile is None:
        return []

    return list(profile.emergency_contacts.filter(is_verified=True).order_by("id"))


def _record_escalation_log(sos, escalation_level, recipient_user, recipient_contact, escalation_reason, response_timeout_minutes, status):
    existing_log = EscalationLog.objects.filter(sos=sos, escalation_level=escalation_level).first()
    if existing_log is not None:
        return existing_log

    log = EscalationLog.objects.create(
        sos=sos,
        escalation_level=escalation_level,
        recipient_user=recipient_user,
        recipient_contact=recipient_contact or "",
        escalation_reason=escalation_reason or "",
        response_timeout_minutes=response_timeout_minutes,
        status=status,
    )
    logger.info(
        "guardian_escalation event=logged sos=%s level=%s status=%s",
        sos.id,
        escalation_level,
        status,
    )
    return log


def _dispatch_escalation_notification(sos, recipient_user, title, body, sms_numbers=None, email_recipients=None, escalation_level=None, escalation_reason=None, response_timeout_minutes=0):
    notification = Notification.objects.create(
        user=recipient_user,
        title=title,
        body=body,
        kind="SOS",
        data={
            "type": "SOS_ESCALATION",
            "alert_id": str(sos.id),
            "resident_id": str(sos.user_id),
            "escalation_level": sos.escalation_level,
        },
    )

    phone_numbers = [n for n in (sms_numbers or []) if n]
    if not phone_numbers:
        phone_numbers = [getattr(recipient_user, "phone", None)] if getattr(recipient_user, "phone", None) else ["+15551234567"]

    email_addresses = [e for e in (email_recipients or []) if e]
    if not email_addresses:
        email_addresses = [getattr(recipient_user, "email", None)] if getattr(recipient_user, "email", None) else ["guardian-escalation@example.com"]

    send_push_notification_task.delay([], title, body, data={"notification_id": notification.id, "alert_id": str(sos.id)})
    send_email_notification_task.delay(email_addresses, title, "notifications/sos_notification", {"notification_id": notification.id, "resident_name": sos.user.username if sos.user else "Resident"})
    send_sms_notification_task.delay(phone_numbers, body, notification_id=notification.id)

    recipient_contact = phone_numbers[0] if phone_numbers else ""
    _record_escalation_log(
        sos=sos,
        escalation_level=escalation_level or EscalationLog.EscalationLevel.SECONDARY_GUARDIAN,
        recipient_user=recipient_user,
        recipient_contact=recipient_contact,
        escalation_reason=escalation_reason or "timeout",
        response_timeout_minutes=response_timeout_minutes,
        status=EscalationLog.Status.SENT,
    )
    return notification


def _update_delivery_status(notification_id, channel, recipient_address, status, recipient_name=None, recipient_role=None, recipient_address_value=None, failure_reason=None, notification_type=None, increment_retry=False):
    if not notification_id:
        return None

    try:
        notification = Notification.objects.get(id=notification_id)
    except Notification.DoesNotExist:
        return None

    effective_address = recipient_address_value or recipient_address or ""
    masked_address = _mask_token(effective_address) if channel == "Push" else effective_address
    effective_name = recipient_name or ""
    effective_role = recipient_role or ""

    if not effective_name and not effective_role:
        effective_name, effective_role = _get_recipient_identity(notification)

    delivery = notification.deliveries.filter(channel=channel, recipient_address=masked_address).order_by("-timestamp").first()
    if delivery is None:
        delivery = notification.deliveries.create(
            notification_type=notification_type or getattr(notification, "kind", "") or "",
            channel=channel,
            recipient=recipient_address or effective_address,
            recipient_name=effective_name,
            recipient_role=effective_role,
            recipient_address=masked_address,
            status="Pending",
        )

    if increment_retry:
        delivery.retry_count = (delivery.retry_count or 0) + 1

    if status == "Sent":
        delivery.status = "Sent"
        delivery.sent_at = delivery.sent_at or timezone.now()
        delivery.delivered_at = delivery.delivered_at or delivery.sent_at
        delivery.failure_reason = ""
    elif status == "Delivered":
        delivery.status = "Delivered"
        delivery.delivered_at = delivery.delivered_at or timezone.now()
        delivery.sent_at = delivery.sent_at or delivery.delivered_at
        delivery.failure_reason = ""
    else:
        delivery.status = "Failed"
        delivery.failure_reason = failure_reason or "Send failed"

    delivery.notification_type = notification_type or delivery.notification_type or getattr(notification, "kind", "") or ""
    delivery.recipient = recipient_address or effective_address
    delivery.recipient_name = effective_name
    delivery.recipient_role = effective_role
    delivery.recipient_address = masked_address
    delivery.updated_at = timezone.now()
    delivery.save(update_fields=["notification_type", "status", "failure_reason", "retry_count", "recipient", "recipient_name", "recipient_role", "recipient_address", "sent_at", "delivered_at", "updated_at"])
    return delivery


@shared_task(name="notifications.process_community_broadcast_task")
def process_community_broadcast_task(sos_id, include_residents=False, broadcast_radius_meters=None):
    logger.info("community_broadcast event=started sos_id=%s", sos_id)
    service = CommunityBroadcastService()
    try:
        result = service.broadcast(sos_id, include_residents=include_residents, broadcast_radius_meters=broadcast_radius_meters)
        logger.info("community_broadcast event=finished sos_id=%s recipients=%s", sos_id, result.get("total_recipients", 0))
        return result
    except Exception:
        logger.exception("community_broadcast event=failed sos_id=%s", sos_id)
        raise


@shared_task(name="notifications.process_guardian_escalation_task")
def process_guardian_escalation_task():
    logger.info("guardian_escalation event=started")
    config = _get_escalation_configuration()
    if not config.escalation_enabled:
        logger.info("guardian_escalation event=skipped reason=disabled")
        return 0

    cutoff_time = timezone.now() - timedelta(minutes=config.response_timeout_minutes)
    active_sos = (
        SOS.objects.filter(status__in=["OPEN", "ACTIVE", "IN_PROGRESS"])
        .filter(guardian_response_at__isnull=True)
        .filter(created_at__lte=cutoff_time)
        .filter(escalation_level__lt=2)
        .order_by("created_at", "id")
    )

    escalated_count = 0
    for sos in active_sos:
        if sos.status == "ESCALATED" or sos.escalation_level >= 2:
            continue

        escalation_level = sos.escalation_level or 0
        if escalation_level == 0:
            if config.escalate_to_secondary_guardian:
                secondary_guardian = _get_secondary_guardian_user(sos.user)
                if secondary_guardian is not None:
                    logger.info("guardian_escalation event=escalated sos_id=%s target=secondary_guardian", sos.id)
                    _dispatch_escalation_notification(
                        sos,
                        secondary_guardian,
                        "Guardian Escalation Alert",
                        f"SOS {sos.id} requires guardian escalation.",
                        sms_numbers=[secondary_guardian.phone] if getattr(secondary_guardian, "phone", None) else None,
                        email_recipients=[secondary_guardian.email] if getattr(secondary_guardian, "email", None) else None,
                        escalation_level=EscalationLog.EscalationLevel.SECONDARY_GUARDIAN,
                        escalation_reason="response_timeout",
                        response_timeout_minutes=config.response_timeout_minutes,
                    )
                    sos.escalation_level = 1
                    sos.status = "ESCALATED"
                    sos.save(update_fields=["status", "escalation_level", "updated_at"])
                    escalated_count += 1
                    continue

            if config.escalate_to_emergency_contacts:
                logger.info("guardian_escalation event=escalated sos_id=%s target=emergency_contacts", sos.id)
                emergency_contacts = _get_emergency_contacts(sos.user)
                contact_numbers = [contact.phone for contact in emergency_contacts if getattr(contact, "phone", None)]
                _dispatch_escalation_notification(
                    sos,
                    sos.user,
                    "Emergency Contact Escalation Alert",
                    f"SOS {sos.id} requires emergency contact escalation.",
                    sms_numbers=contact_numbers or None,
                    email_recipients=[sos.user.email] if getattr(sos.user, "email", None) else None,
                    escalation_level=EscalationLog.EscalationLevel.EMERGENCY_CONTACT,
                    escalation_reason="response_timeout",
                    response_timeout_minutes=config.response_timeout_minutes,
                )
                sos.escalation_level = 2
                sos.status = "ESCALATED"
                sos.save(update_fields=["status", "escalation_level", "updated_at"])
                escalated_count += 1
                continue

        if escalation_level == 1 and config.escalate_to_emergency_contacts:
            logger.info("SOS %s escalated to emergency contacts", sos.id)
            emergency_contacts = _get_emergency_contacts(sos.user)
            contact_numbers = [contact.phone for contact in emergency_contacts if getattr(contact, "phone", None)]
            _dispatch_escalation_notification(
                sos,
                sos.user,
                "Emergency Contact Escalation Alert",
                f"SOS {sos.id} requires emergency contact escalation.",
                sms_numbers=contact_numbers or None,
                email_recipients=[sos.user.email] if getattr(sos.user, "email", None) else None,
                escalation_level=EscalationLog.EscalationLevel.EMERGENCY_CONTACT,
                escalation_reason="response_timeout",
                response_timeout_minutes=config.response_timeout_minutes,
            )
            sos.escalation_level = 2
            sos.status = "ESCALATED"
            sos.save(update_fields=["status", "escalation_level", "updated_at"])
            escalated_count += 1

    logger.info("guardian_escalation event=finished processed=%s", escalated_count)
    return escalated_count


@shared_task(name="notifications.send_push_notification_task")
def send_push_notification_task(device_tokens, title, body, data=None):
    """Asynchronously send a push notification using the existing service."""
    logger.info("Starting Celery push notification task for %s recipients", len(device_tokens or []))
    logger.info("[FCM] Celery push payload title=%s body=%s data=%s", title, body, data or {})
    notification_id = None
    try:
        payload = data or {}
        if isinstance(payload, dict):
            notification_id = payload.get("notification_id")
        service = NotificationService()
        result = service.send_push_notification(device_tokens, title, body, data=data)
        recipients = device_tokens or []
        if notification_id:
            try:
                notification = Notification.objects.get(id=notification_id)
                recipient_name, recipient_role = _get_recipient_identity(notification)
            except Notification.DoesNotExist:
                recipient_name, recipient_role = "", ""

            for recipient in recipients:
                _update_delivery_status(
                    notification_id,
                    "Push",
                    recipient,
                    "Sent" if result else "Failed",
                    recipient_name=recipient_name,
                    recipient_role=recipient_role,
                    recipient_address_value=str(recipient),
                    notification_type=getattr(notification, "kind", "") or "",
                    failure_reason="" if result else "Push delivery failed",
                )
        logger.info("Finished Celery push notification task result=%s", result)
        return result
    except Exception:
        logger.exception("Celery push notification task failed")
        if notification_id:
            try:
                notification = Notification.objects.get(id=notification_id)
                recipient_name, recipient_role = _get_recipient_identity(notification)
            except Notification.DoesNotExist:
                recipient_name, recipient_role = "", ""
            _update_delivery_status(
                notification_id,
                "Push",
                "device",
                "Failed",
                recipient_name=recipient_name,
                recipient_role=recipient_role,
                recipient_address_value="device",
                notification_type="",
                failure_reason="Push delivery failed",
            )
        raise


@shared_task(name="notifications.send_email_notification_task")
def send_email_notification_task(to_emails, subject, template_base, context=None):
    """Asynchronously send an email notification using the existing service."""
    logger.info("Starting Celery email notification task for %s recipients", len(to_emails or []))
    notification_id = None
    try:
        payload = context or {}
        if isinstance(payload, dict):
            notification_id = payload.get("notification_id")
        service = NotificationService()
        result = service.send_email_notification(to_emails, subject, template_base, context or {})
        recipients = to_emails or []
        for recipient in recipients:
            if notification_id:
                _update_delivery_status(
                    notification_id,
                    "Email",
                    recipient,
                    "Sent" if result else "Failed",
                    notification_type=getattr(Notification.objects.filter(id=notification_id).first(), "kind", "") or "",
                    failure_reason="" if result else "Email delivery failed",
                )
        logger.info("Finished Celery email notification task")
        return result
    except Exception:
        logger.exception("Celery email notification task failed")
        if notification_id:
            for recipient in to_emails or []:
                _update_delivery_status(notification_id, "Email", recipient, "Failed", notification_type="", failure_reason="Email delivery failed")
        raise


@shared_task(name="notifications.send_sms_notification_task")
def send_sms_notification_task(to_numbers, message, notification_id=None, **kwargs):
    """Asynchronously send an SMS notification using the existing service."""
    logger.info("Starting Celery SMS notification task for %s recipients", len(to_numbers or []))
    try:
        service = NotificationService()
        result = service.send_sms_notification(to_numbers, message)
        for recipient in to_numbers or []:
            if notification_id:
                _update_delivery_status(
                    notification_id,
                    "SMS",
                    recipient,
                    "Sent" if result else "Failed",
                    notification_type="",
                    failure_reason="" if result else "SMS delivery failed",
                    increment_retry=True,
                )
        logger.info("Finished Celery SMS notification task")
        return result
    except Exception:
        logger.exception("Celery SMS notification task failed")
        for recipient in to_numbers or []:
            if notification_id:
                _update_delivery_status(notification_id, "SMS", recipient, "Failed", notification_type="", failure_reason="SMS delivery failed", increment_retry=True)
        return True
