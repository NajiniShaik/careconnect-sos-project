import os,sys
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BASE))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
User=get_user_model()
admin=User.objects.filter(id=1).first()
if not admin:
    print('NO_ADMIN')
else:
    r=RefreshToken.for_user(admin)
    print('access:',str(r.access_token))
    print('refresh:',str(r))
