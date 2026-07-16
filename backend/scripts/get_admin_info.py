import os,sys
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BASE))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.contrib.auth import get_user_model
User=get_user_model()
admin=User.objects.filter(id=1).first()
if admin:
    print(admin.id, getattr(admin,'username',None), getattr(admin,'email',None), getattr(admin,'role',None))
else:
    print('NO_ADMIN')
