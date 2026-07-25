import logging

from celery import shared_task
from django.utils import timezone

from notifications.models import Notification, NotificationDelivery
from notifications.services import NotificationService

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


def _update_delivery_status(notification_id, channel, recipient_address, status, recipient_name=None, recipient_role=None, recipient_address_value=None):
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
        return notification.deliveries.create(
            channel=channel,
            recipient=recipient_address or effective_address,
            recipient_name=effective_name,
            recipient_role=effective_role,
            recipient_address=masked_address,
            status=status,
        )

    delivery.status = status
    delivery.recipient = recipient_address or effective_address
    delivery.recipient_name = effective_name
    delivery.recipient_role = effective_role
    delivery.recipient_address = masked_address
    delivery.updated_at = timezone.now()
    delivery.save(update_fields=["status", "recipient", "recipient_name", "recipient_role", "recipient_address", "updated_at"])
    return delivery


@shared_task(name="notifications.send_push_notification_task")
def send_push_notification_task(device_tokens, title, body, data=None):
    """Asynchronously send a push notification using the existing service."""
    logger.info("Starting Celery push notification task for %s recipients", len(device_tokens or []))
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
                )
        logger.info("Finished Celery push notification task")
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
                _update_delivery_status(notification_id, "Email", recipient, "Sent" if result else "Failed")
        logger.info("Finished Celery email notification task")
        return result
    except Exception:
        logger.exception("Celery email notification task failed")
        if notification_id:
            for recipient in to_emails or []:
                _update_delivery_status(notification_id, "Email", recipient, "Failed")
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
                _update_delivery_status(notification_id, "SMS", recipient, "Sent" if result else "Failed")
        logger.info("Finished Celery SMS notification task")
        return result
    except Exception:
        logger.exception("Celery SMS notification task failed")
        for recipient in to_numbers or []:
            if notification_id:
                _update_delivery_status(notification_id, "SMS", recipient, "Failed")
        return True
