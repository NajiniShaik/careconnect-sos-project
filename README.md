# CareConnect – Community Emergency Response & Assistance Network

## Overview

CareConnect is a community safety and emergency response platform designed for residential societies. It enables residents to quickly trigger SOS alerts, manage emergency contacts, and communicate with society administrators and security personnel through a centralized system.

The project consists of three main applications:

* **Backend** – Django REST Framework API
* **Admin Web Portal** – React
* **Mobile Application** – Expo React Native

---

## Features

### Authentication

* JWT-based authentication
* Multi-role login and registration
* Resident
* Guardian
* Volunteer
* Security
* Admin
* Role-based authorization

### Society Management

* Society management
* Block/Tower management
* Flat management
* Resident onboarding
* Resident approval workflow

### Resident Module

* Resident profile
* Society mapping
* Profile information
* Approval status

### Emergency Contacts

* Add emergency contacts
* Edit emergency contacts
* Delete emergency contacts
* Primary and secondary guardian support
* Contact verification status

### SOS Module

* One-tap SOS trigger
* Emergency message support
* Location support
* SOS history
* Recent SOS activity
* Status tracking

### Mobile Application

* Login
* Registration
* Society selection
* Resident dashboard
* Resident profile
* Emergency contacts
* Contact verification
* SOS screen
* Responsive UI
* Loading states
* Validation
* Error handling

### Admin Portal

* Authentication
* Society management
* Resident management
* Approval workflow
* Emergency monitoring
* Dashboard

---

# Technology Stack

## Backend

* Python
* Django
* Django REST Framework
* PostgreSQL
* JWT Authentication
* Swagger (DRF-YASG)

## Admin Web

* React
* React Router
* Axios

## Mobile App

* Expo
* React Native
* Expo Router
* Axios

---

# Project Structure

```text
careconnect/
│
├── backend/
│   ├── config/
│   ├── users/
│   ├── society/
│   ├── emergency/
│   ├── notifications/
│   └── sos/
│
├── admin-web/
│   ├── src/
│   └── public/
│
├── mobile-app/
│   ├── src/
│   └── assets/
│
└── README.md
```

---

# Installation

## Backend

```bash
cd backend

python -m venv venv

# Windows
venv\Scripts\activate

pip install -r requirements.txt

python manage.py migrate

python manage.py runserver
```

---

## Admin Web

```bash
cd admin-web

npm install

npm start
```

---

## Mobile App

```bash
cd mobile-app

npm install

npx expo start
```

---

# API

The backend exposes REST APIs for:

* Authentication
* Registration
* Society Management
* Resident Management
* Emergency Contacts
* Contact Verification
* SOS Management

---

# Current Status

## Milestone 1 Completed

* Project setup
* Authentication
* Registration
* Society onboarding
* Resident profile
* Emergency contacts
* Contact verification
* SOS alert system
* Dashboard
* UI polish
* Integration testing

---

# Future Enhancements

* Push notifications
* Live location sharing
* Volunteer dispatch
* Incident timeline
* Admin analytics
* Real-time SOS updates
* Notification center
* Community announcements

---

# License

This project is developed for educational and academic purposes.
