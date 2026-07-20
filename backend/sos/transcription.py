import io
import logging
import os
import threading
import sys
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def _openai_transcribe(file_obj):
    # Lazy import so the module can be imported even when openai is not
    # installed in the environment. This function will raise a clear
    # RuntimeError if the package or API key is missing.
    try:
        from openai import OpenAI
    except Exception as exc:  # pragma: no cover - defensive
        raise RuntimeError("openai package not installed") from exc

    api_key = os.environ.get("OPENAI_API_KEY")

    if not api_key:
        raise RuntimeError("OPENAI_API_KEY environment variable is not set")

    client = OpenAI(api_key=api_key)

    result = client.audio.transcriptions.create(
        model="whisper-1",
        file=file_obj,
    )

    return result.text.strip()

def transcribe_audio(audio_path: Optional[str] = None, audio_bytes: Optional[bytes] = None, filename: Optional[str] = None) -> str:
    if not audio_path and not audio_bytes:
        raise ValueError("Audio path or audio bytes are required")

    if audio_bytes is not None:
        file_name = filename or "audio.m4a"
        file_obj = io.BytesIO(audio_bytes)
        file_obj.name = file_name
        return _openai_transcribe(file_obj)

    path = Path(audio_path)
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    with path.open("rb") as audio_file:
        return _openai_transcribe(audio_file)
  
def enqueue_transcription(message, audio_path: Optional[str], transcribe_func=None, force_sync=None) -> None:
    callback = transcribe_func if transcribe_func is not None else transcribe_audio

    def _run() -> None:
        from django.db import close_old_connections
        from django.utils import timezone
        from django.db import transaction

        if not (force_sync or ("test" in sys.argv)):
            close_old_connections()

        try:
            transcript = callback(audio_path)
            completed_at = timezone.now()
            message.__class__.objects.filter(pk=message.pk).update(
                transcript=transcript,
                transcription_status="COMPLETED",
                transcription_completed_at=completed_at,
            )
            sos_updated = message.sos.__class__.objects.filter(pk=message.sos_id).update(
                transcript=transcript,
                transcription_status="COMPLETED",
                transcription_completed_at=completed_at,
            )
        except Exception as exc:  # pragma: no cover - defensive fallback
            logger.exception("SOS transcription failed", exc_info=exc)
            try:
                message.__class__.objects.filter(pk=message.pk).update(
                    transcription_status="FAILED",
                    transcript="",
                    transcription_completed_at=None,
                )
                message.sos.__class__.objects.filter(pk=message.sos_id).update(
                    transcription_status="FAILED",
                    transcript="",
                    transcription_completed_at=None,
                )
            except Exception:
                logger.exception("SOS transcription fallback update failed", exc_info=exc)

    from django.db import transaction
    from django.conf import settings

    should_sync = force_sync
    if should_sync is None:
        should_sync = "test" in sys.argv or settings.DEBUG is True

    if should_sync:
        _run()
        return

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
