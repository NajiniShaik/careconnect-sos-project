import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.core.files.uploadedfile import SimpleUploadedFile
from users.models import User
from sos.models import SOS, SOSMessage
from unittest.mock import patch
from sos.transcription import enqueue_transcription
import time

user = User.objects.create_user(username='debug_user', email='debug@example.com', password='password', role='RESIDENT')
sos = SOS.objects.create(user=user, message='Need help', location='A', category='medical', status='OPEN')
audio_file = SimpleUploadedFile('voice-note.m4a', b'fake-audio-data', content_type='audio/m4a')

with patch('sos.transcription.transcribe_audio', return_value='Help is needed immediately'):
    message = SOSMessage.objects.create(sos=sos, sender=user, message='', audio_file=audio_file)
    enqueue_transcription(message, message.audio_file.path)
    for _ in range(50):
        message.refresh_from_db()
        print('loop', _, 'status', message.transcription_status)
        if message.transcription_status in {'COMPLETED', 'FAILED'}:
            break
        time.sleep(0.1)
    print('final', message.transcription_status, message.transcript)
    print('sos', sos.transcription_status, sos.transcript)
