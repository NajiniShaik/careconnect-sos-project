import os 
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings') 
import django 
django.setup() 
from users.models import User 
u = User.objects.get(email__iexact='shaiknajini65@gmail.com') 
print(u.check_password('1234567')) 
