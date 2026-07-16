import os,sys
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BASE))
if len(sys.argv)<2:
    print('usage: python generate_token_for_user.py <user_id>')
    sys.exit(1)
user_id = int(sys.argv[1])
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
User=get_user_model()
user=User.objects.filter(id=user_id).first()
if not user:
    print('NO_USER')
else:
    r=RefreshToken.for_user(user)
    print('access:',str(r.access_token))
    print('refresh:',str(r))
    print('user:', {'id': user.id, 'username': getattr(user,'username',None), 'email': getattr(user,'email',None), 'role': getattr(user,'role',None)})
