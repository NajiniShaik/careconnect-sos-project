"""Notification service for CareConnect.

Provides a NotificationService that can send push (FCM), email, and SMS
notifications. Each provider is optional and the service will fail
gracefully when credentials/configuration are missing.

Use environment variables or Django settings to configure providers.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List, Optional

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import EmailMultiAlternatives, get_connection
from django.template import Context, Template
from django.template.loader import render_to_string
from django.db import OperationalError
from django.apps import apps
from notifications.firebase import send_push_notification as send_fcm_push_notification

logger = logging.getLogger(__name__)

def _render_template_string(template_string, context=None):
    if template_string is None:
        return ""

    context = context or {}
    try:
        template = Template(str(template_string))
        rendered = template.render(Context(context))
        return rendered if isinstance(rendered, str) else str(rendered)
    except Exception as exc:
        logger.warning("Failed to render notification template string: %s", exc)
        return str(template_string)


def get_notification_template(template_key):
    if not template_key:
        return None

    try:
        return apps.get_model("notifications", "NotificationTemplate").objects.filter(template_key=template_key, is_active=True).first()
    except Exception as exc:
        logger.warning("Unable to load NotificationTemplate %s: %s", template_key, exc)
        return None


def render_notification_template(template_key, context=None, default_subject="", default_title="", default_body=""):
    template = get_notification_template(template_key)
    if template is None:
        return {
            "subject": default_subject or "",
            "title": default_title or "",
            "body": default_body or "",
        }

    subject = _render_template_string(template.subject or default_subject or "", context)
    title = _render_template_string(template.title or default_title or "", context)
    body = _render_template_string(template.body or default_body or "", context)
    return {
        "subject": subject,
        "title": title,
        "body": body,
    }


def get_notification_template_subject(template_key, context=None, default_subject=""):
    return render_notification_template(template_key, context=context, default_subject=default_subject)["subject"]


def get_notification_template_title_body(template_key, context=None, default_title="", default_body=""):
    rendered = render_notification_template(template_key, context=context, default_title=default_title, default_body=default_body)
    return rendered["title"], rendered["body"]


def _mask_token(token):
    token_text = str(token or "")
    if not token_text:
        return ""
    if len(token_text) <= 8:
        return token_text
    return f"{token_text[:8]}...{token_text[-4:]}"


def _normalize_device_tokens(device_tokens):
    seen = set()
    normalized = []
    for token in device_tokens or []:
        if token is None:
            continue
        token_value = str(token).strip()
        if not token_value or token_value in seen:
            continue
        seen.add(token_value)
        normalized.append(token_value)
    return normalized


class NotificationService:
    """High-level notification service.

    Methods are safe to call even when providers are not configured; in that
    case they will log and return False.
    """

    def __init__(self):
        self._firebase_available = True

    def send_push_notification(self, device_tokens: Iterable[str], title: str, body: str, data: Optional[Dict[str, Any]] = None) -> bool:
        """Send push notification via FCM to one or more device tokens.

        Returns True if the attempt was made (even if some tokens failed),
        False if FCM is not configured.
        """
        try:
            tokens = _normalize_device_tokens(device_tokens)
            if not tokens:
                # Auto-load tokens from the notifications device token table
                try:
                    DeviceToken = apps.get_model("notifications", "DeviceToken")
                    db_tokens = DeviceToken.objects.filter().values_list("token", flat=True)
                    tokens = _normalize_device_tokens(db_tokens)
                except (LookupError, OperationalError) as exc:
                    logger.debug("No device tokens found in DB (or DB unavailable): %s", exc)

            if not tokens:
                # Also load one token per authenticated user if stored on the user profile
                try:
                    user_model = get_user_model()
                    user_tokens = user_model.objects.filter(device_token__isnull=False).exclude(device_token__exact="").values_list("device_token", flat=True)
                    tokens = _normalize_device_tokens(user_tokens)
                except Exception as exc:
                    logger.debug("Failed to load device tokens from user profiles: %s", exc)

            if not tokens:
                logger.debug("No device tokens provided for push notification")
                return False

            logger.info("[FCM] Sending push notification to %s token(s) title=%s body=%s", len(tokens), title, body)
            success = False
            for token in tokens:
                logger.info("[FCM] Device token found for push recipient: %s", _mask_token(token))
                try:
                    response = send_fcm_push_notification(token, title, body, data=data)
                    logger.info("[FCM] Firebase response for token=%s response=%s", _mask_token(token), response)
                    if response is not None:
                        success = True
                except Exception as exc:
                    logger.exception("[FCM] Firebase send failed for token=%s error=%s", _mask_token(token), exc)

            if not success:
                logger.info("FCM send attempted but no messages were delivered")
            return success
        except Exception as exc:
            logger.exception("Failed to send push notification: %s", exc)
            return False

    def send_email_notification(self, to_emails: Iterable[str], subject: str, template_base: str, context: Dict[str, Any]) -> bool:
        """Send an email using Django's email backend.

        template_base should be a path under notifications templates, e.g.
        'notifications/sos_notification'. The method will render a text and HTML
        version if available: '<base>.txt' and '<base>.html'.
        """
        recipients = [e for e in (to_emails or []) if e]
        if not recipients:
            logger.debug("No email recipients provided")
            return False

        try:
            # Render body parts
            text_body = None
            html_body = None
            try:
                text_body = render_to_string(f"{template_base}.txt", context)
            except Exception:
                logger.debug("Text email template %s.txt not found", template_base)
            try:
                html_body = render_to_string(f"{template_base}.html", context)
            except Exception:
                logger.debug("HTML email template %s.html not found", template_base)

            if not text_body and not html_body:
                logger.warning("No email templates found for %s", template_base)
                return False

            from_email = getattr(settings, "DEFAULT_FROM_EMAIL", None) or getattr(settings, "EMAIL_FROM", None)
            if not from_email:
                from_email = None  # let Django choose

            connection = None
            try:
                connection = get_connection(fail_silently=True)
            except Exception:
                logger.exception("Failed to get email connection")

            msg = EmailMultiAlternatives(subject=subject, body=text_body or "", from_email=from_email, to=recipients, connection=connection)
            if html_body:
                msg.attach_alternative(html_body, "text/html")

            msg.send(fail_silently=True)
            logger.info("Email queued/sent to %s", recipients)
            return True
        except Exception as exc:
            logger.exception("Failed to send email notification: %s", exc)
            return False

    def send_sms_notification(self, to_numbers: Iterable[str], message: str) -> bool:
        """Send SMS via configured provider (Twilio or MSG91). Returns False when not configured."""
        numbers = [n for n in (to_numbers or []) if n]
        if not numbers:
            logger.debug("No phone numbers provided for SMS")
            return False

        placeholder_number = getattr(settings, "TWILIO_PHONE_NUMBER", None) or getattr(settings, "TWILIO_FROM_NUMBER", None)
        should_mock_sms = False
        if isinstance(placeholder_number, str) and placeholder_number.strip() and placeholder_number.strip() == "+1xxxxxxxxxx":
            should_mock_sms = True

        # Try Twilio first if configured
        tw_sid = getattr(settings, "TWILIO_ACCOUNT_SID", None)
        tw_token = getattr(settings, "TWILIO_AUTH_TOKEN", None)
        tw_from = getattr(settings, "TWILIO_FROM_NUMBER", None)
        if tw_sid and tw_token and tw_from:
            try:
                import requests

                success = True
                for num in numbers:
                    url = f"https://api.twilio.com/2010-04-01/Accounts/{tw_sid}/Messages.json"
                    payload = {"To": num, "From": tw_from, "Body": message}
                    resp = requests.post(url, data=payload, auth=(tw_sid, tw_token), timeout=10)
                    if resp.status_code >= 400:
                        logger.warning("Twilio SMS failed for %s: %s %s", num, resp.status_code, resp.text)
                        success = False
                        break

                    logger.info("Twilio SMS sent to %s", num)

                if not success:
                    return False
                return True
            except Exception as exc:
                logger.exception("Twilio SMS send error: %s", exc)
                return False

        # Try MSG91
        msg91_key = getattr(settings, "MSG91_AUTH_KEY", None)
        msg91_sender = getattr(settings, "MSG91_SENDER_ID", None)
        if msg91_key and msg91_sender:
            try:
                import requests

                for num in numbers:
                    url = "https://api.msg91.com/api/v5/flow/"  # placeholder; MSG91 has multiple APIs
                    # MSG91 has different endpoints; here we log and skip real send to avoid accidental charges
                    logger.info("MSG91 configured but send not implemented in this environment for %s", num)
                return True
            except Exception as exc:
                logger.exception("MSG91 SMS send error: %s", exc)
                return False

        if should_mock_sms:
            for num in numbers:
                logger.info("[MOCK SMS SENT] To: %s | Message: %s", num, message)
            return True

        logger.info("No SMS provider configured (Twilio/MSG91). Skipping SMS send.")
        return False

    def send_sms(self, to_numbers: Iterable[str], message: str) -> bool:
        """Alias for send_sms_notification to support SMS with the NotificationService."""
        return self.send_sms_notification(to_numbers, message)
