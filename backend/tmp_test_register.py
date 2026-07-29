import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from notifications.serializers import RegisterDeviceSerializer
payloads = [
    {'device_token':'abc','platform':'android','device_id':'x'},
    {'device_token':'abc','platform':'Android','device_id':'x'},
    {'token':'abc','platform':'android','device_id':'x'},
    {'device_token':'','platform':'android','device_id':'x'},
    {'device_token':'abc','platform':'unknown','device_id':'x'},
    {'device_token':'abc','platform':'web','device_id':'x'},
]
for p in payloads:
    s = RegisterDeviceSerializer(data=p)
    valid = s.is_valid()
    print(p, '->', valid, s.errors if not valid else s.validated_data)
