try:
	from .celery import app as celery_app
except Exception:
	# Allow tests or environments without Celery installed to import Django settings.
	celery_app = None

__all__ = ("celery_app",)