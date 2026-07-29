import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from notifications.serializers import RegisterDeviceSerializer

payload = {'device_token': 'abc123', 'platform': 'Android', 'device_id': 'device-1'}
serializer = RegisterDeviceSerializer(data=payload)
serializer.is_valid()
print('serializer.initial_data =', serializer.initial_data)
print('serializer.errors =', serializer.errors)
