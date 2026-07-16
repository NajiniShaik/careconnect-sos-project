import json, urllib.request
url='http://127.0.0.1:8000/api/sos/trigger/'
data=json.dumps({"message":"Test SOS from agent","location":"Home","category":"medical","latitude":12.9716,"longitude":77.5946,"priority":"HIGH"}).encode('utf-8')
req=urllib.request.Request(url, data=data, method='POST')
req.add_header('Content-Type','application/json')
req.add_header('Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzg0MTc4NTg1LCJpYXQiOjE3ODQxNzgyODUsImp0aSI6Ijg0YThhYzhkNzM3NjRhMTBiY2QwZTQ4ZDVjMTg0YTNiIiwidXNlcl9pZCI6IjIifQ.kJ7jvwVcFhOYy7CNSvoP9qVkkkulb1F1hiZhYfiiAEQ')
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        print(resp.status)
        print(resp.read().decode())
except Exception as e:
    import traceback
    traceback.print_exc()
