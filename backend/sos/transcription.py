import io
import logging
import threading
import sys
import requests
from pathlib import Path
from typing import Optional
from django.conf import settings

logger = logging.getLogger(__name__)

try:
    from huggingface_hub import InferenceClient
except ImportError:
    InferenceClient = None

client = None
if InferenceClient is not None:
    client = InferenceClient(
        provider="fal-ai",
        api_key=settings.HF_API_KEY
    )

HF_MODEL="openai/whisper-tiny"

def _hf_transcribe(file_obj):

    file_obj.seek(0)

    audio_bytes = file_obj.read()

    result = client.automatic_speech_recognition(
        audio=audio_bytes,
        model="openai/whisper-large-v3"
    )

    return result.text


def transcribe_audio(audio_path: Optional[str] = None, audio_bytes: Optional[bytes] = None, filename: Optional[str] = None) -> str:
    if not audio_path and not audio_bytes:
        raise ValueError("Audio path or audio bytes are required")

    if audio_bytes is not None:
        file_name = filename or "audio.m4a"
        file_obj = io.BytesIO(audio_bytes)
        file_obj.name = file_name
        return _hf_transcribe(file_obj)

    path = Path(audio_path)
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    with path.open("rb") as audio_file:
        return _hf_transcribe(audio_file)
  
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
