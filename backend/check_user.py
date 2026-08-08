import os 
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings') 
import django 
django.setup() 
from users.models import User 
qs = User.objects.filter(email__iexact='shaiknajini65@gmail.com') 
print('count', qs.count()) 
print(list(qs.values('id','username','email','is_active','is_staff','is_superuser','role'))) 
