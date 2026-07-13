from django.db import models

# Create your models here.


class Society(models.Model):
    name = models.CharField(max_length=100, unique=True)
    address = models.TextField()
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    pincode = models.CharField(max_length=10)

    def __str__(self):
        return self.name


class Block(models.Model):
    society = models.ForeignKey(
        Society,
        on_delete=models.CASCADE,
        related_name="blocks"
    )

    name = models.CharField(max_length=50)

    total_flats = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("society", "name")

    def __str__(self):
        return f"{self.society.name} - {self.name}"


class Flat(models.Model):
    block = models.ForeignKey(
        Block,
        on_delete=models.CASCADE,
        related_name="flats"
    )

    flat_number = models.CharField(max_length=20)

    floor = models.PositiveIntegerField()

    flat_type = models.CharField(max_length=20)

    is_occupied = models.BooleanField(default=False)

    class Meta:
        unique_together = ("block", "flat_number")

    def __str__(self):
        return self.flat_number
    

