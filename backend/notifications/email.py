"""Simple email helper that reuses Django's email backend.

Provides a small, reusable `send_email` function used by other modules
to send plain/text (and optional HTML) emails without duplicating SMTP setup.
"""
from __future__ import annotations

import logging
from typing import Iterable, Optional

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)


def _normalize_recipients(recipients: Iterable[str]) -> list:
    return [str(r).strip() for r in (recipients or []) if r and str(r).strip()]


def send_email(recipients: Iterable[str], subject: str, body: str, html_body: Optional[str] = None) -> bool:
    """Send an email using Django's configured email backend.

    Returns True on success, False on failure (errors are logged).
    This helper intentionally does not raise so callers can treat email as
    best-effort without impacting primary flows.
    """
    to_addrs = _normalize_recipients(recipients)
    if not to_addrs:
        logger.warning("send_email called with no recipients")
        return False

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", None) or getattr(settings, "EMAIL_HOST_USER", None)

    try:
        msg = EmailMultiAlternatives(subject=subject or "", body=body or "", from_email=from_email, to=to_addrs)
        if html_body:
            msg.attach_alternative(html_body, "text/html")
        msg.send(fail_silently=False)
        logger.info("Email sent to %s (subject=%s)", to_addrs, subject)
        return True
    except Exception as exc:  # pragma: no cover - logging path
        logger.exception("Failed to send email to %s (subject=%s): %s", to_addrs, subject, exc)
        return False
