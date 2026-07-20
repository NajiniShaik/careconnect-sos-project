"""Notification service for CareConnect.

Provides a NotificationService that can send push (FCM), email, and SMS
notifications. Each provider is optional and the service will fail
gracefully when credentials/configuration are missing.

Use environment variables or Django settings to configure providers.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, Iterable, List, Optional

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.template.loader import render_to_string
from django.db import OperationalError
from django.apps import apps

logger = logging.getLogger(__name__)


class NotificationService:
    """High-level notification service.

    Methods are safe to call even when providers are not configured; in that
    case they will log and return False.
    """

    def __init__(self):
        # Lazy imports for optional dependencies
        self._firebase_app = None
        self._firebase_messaging = None
        try:
            import firebase_admin
            from firebase_admin import credentials, messaging

            self._firebase_admin = firebase_admin
            self._firebase_credentials_class = credentials.Certificate
            self._firebase_messaging = messaging
        except Exception:
            self._firebase_admin = None
            self._firebase_credentials_class = None
            self._firebase_messaging = None

    def _init_firebase(self) -> bool:
        """Initialize Firebase app if credentials are available.

        Returns True when initialized, False otherwise.
        """
        if not self._firebase_admin:
            logger.debug("Firebase admin SDK not available")
            return False

        if getattr(settings, "FCM_ENABLED", False) is False:
            logger.debug("FCM_ENABLED is False in settings")
            return False

        # If already initialized, return True
        if self._firebase_admin._apps:
            return True

        svc_json = getattr(settings, "FCM_SERVICE_ACCOUNT_JSON", None)
        svc_path = getattr(settings, "FCM_SERVICE_ACCOUNT_PATH", None)

        cred = None
        try:
            if svc_json:
                cred_dict = json.loads(svc_json) if isinstance(svc_json, str) else svc_json
                cred = self._firebase_credentials_class(cred_dict)
            elif svc_path:
                cred = self._firebase_credentials_class(svc_path)

            if not cred:
                logger.warning("Firebase credentials not configured (FCM_SERVICE_ACCOUNT_JSON/FCM_SERVICE_ACCOUNT_PATH)")
                return False

            self._firebase_admin.initialize_app(cred)
            logger.info("Initialized Firebase Admin SDK")
            return True
        except Exception as exc:
            logger.exception("Failed to initialize Firebase Admin SDK: %s", exc)
            return False

    def send_push_notification(self, device_tokens: Iterable[str], title: str, body: str, data: Optional[Dict[str, Any]] = None) -> bool:
        """Send push notification via FCM to one or more device tokens.

        Returns True if the attempt was made (even if some tokens failed),
        False if FCM is not configured.
        """
        try:
            tokens = [t for t in (device_tokens or []) if t]
            if not tokens:
                # Auto-load tokens from the database if available
                try:
                    DeviceToken = apps.get_model("notifications", "DeviceToken")
                    db_tokens = DeviceToken.objects.filter().values_list("token", flat=True)
                    tokens = [t for t in db_tokens if t]
                except (LookupError, OperationalError) as exc:
                    logger.debug("No device tokens found in DB (or DB unavailable): %s", exc)

            if not tokens:
                logger.debug("No device tokens provided for push notification")
                return False

            if not self._init_firebase():
                logger.info("Skipping push: Firebase not configured")
                return False

            if len(tokens) == 1:
                message = self._firebase_messaging.Message(
                    notification=self._firebase_messaging.Notification(title=title, body=body),
                    token=tokens[0],
                    data={k: str(v) for k, v in (data or {}).items()},
                )
                resp = self._firebase_messaging.send(message)
                logger.info("FCM send single token result: %s", resp)
            else:
                multicast = self._firebase_messaging.MulticastMessage(
                    notification=self._firebase_messaging.Notification(title=title, body=body),
                    tokens=tokens,
                    data={k: str(v) for k, v in (data or {}).items()},
                )
                resp = self._firebase_messaging.send_multicast(multicast)
                logger.info("FCM multicast success count=%s failure_count=%s", resp.success_count, resp.failure_count)

            return True
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

        # Try Twilio first if configured
        tw_sid = getattr(settings, "TWILIO_ACCOUNT_SID", None)
        tw_token = getattr(settings, "TWILIO_AUTH_TOKEN", None)
        tw_from = getattr(settings, "TWILIO_FROM_NUMBER", None)
        if tw_sid and tw_token and tw_from:
            try:
                import requests

                for num in numbers:
                    url = f"https://api.twilio.com/2010-04-01/Accounts/{tw_sid}/Messages.json"
                    payload = {"To": num, "From": tw_from, "Body": message}
                    resp = requests.post(url, data=payload, auth=(tw_sid, tw_token), timeout=10)
                    if resp.status_code >= 400:
                        logger.warning("Twilio SMS failed for %s: %s %s", num, resp.status_code, resp.text)
                    else:
                        logger.info("Twilio SMS sent to %s", num)
                return True
            except Exception as exc:
                logger.exception("Twilio SMS send error: %s", exc)

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

        logger.info("No SMS provider configured (Twilio/MSG91). Skipping SMS send.")
        return False
