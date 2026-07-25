from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0005_notificationdelivery'),
    ]

    operations = [
        migrations.AddField(
            model_name='notificationdelivery',
            name='recipient_name',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='notificationdelivery',
            name='recipient_role',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='notificationdelivery',
            name='recipient_address',
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
