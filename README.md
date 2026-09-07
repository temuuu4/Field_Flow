# FieldFlow

FieldFlow is a full-stack field-operations web application built with **React, Express, and MongoDB**.

It is designed to help organizations manage field assignments, collection locations, routes, drivers, sample collection, GPS tracking, and operational notifications through one centralized platform.

## Project Overview

FieldFlow supports three main roles:

* **IT Admin** — system and user administration
* **Operator** — assignment, route, collection-location, and operational management
* **Driver** — field assignments, navigation, GPS tracking, barcode scanning, and sample collection

The system is being developed with a strong focus on **security, reliability, user experience, and professional deployment readiness**.

## Current Progress

### ✅ Completed

**Authentication & Security**

* Secure registration and login
* Cookie-based authentication
* Role-based authorization
* CSRF protection
* CORS configuration
* Security headers
* Server-side ownership and permission checks
* Secure password handling

**Assignment Management**

* Assignment creation
* Driver assignment
* Assignment status management
* Driver accept/decline workflow
* Decline reasons
* Collection locations
* Assignment purpose
* Date and time scheduling
* Newest assignments displayed first

**Journey & Operations**

* Driver journeys
* Ordered collection stops
* Active-stop management
* Journey start and completion
* Server-side state validation
* Driver location and journey tracking

**Maps & GPS**

* Leaflet / React Leaflet maps
* OpenStreetMap map data
* Live browser GPS
* Driver presence tracking
* GPS history
* OSRM road-routing integration
* Route distance and ETA
* Live driver position

**Barcode & Samples**

* Barcode scanning
* Barcode validation
* Sample creation
* Sample submission
* Assignment/stop relationships
* Duplicate barcode protection

**Notifications**

* In-app notifications
* Web Push infrastructure
* Browser/service-worker notifications
* Assignment-related notifications

**Recurring Work**

* Recurring schedules
* Automatic recurring assignment generation
* Safe recurring occurrence handling

**Development**

* HTTPS development environment
* Production-oriented environment configuration
* Frontend production build
* Backend validation

## 🚧 Current Development

The main remaining work is completing and polishing the **Driver field workflow**.

The target Driver experience is:

```text id="f4xozh"
Assigned Work
     ↓
Accept / Decline
     ↓
Start Journey
     ↓
Live GPS
     ↓
Real Road Navigation
     ↓
Arrive at Collection Location
     ↓
Scan Barcode
     ↓
Submit Sample
     ↓
Complete Stop
     ↓
Navigate to Next Stop
     ↓
Complete Journey
```

Current work is focused on making these steps operate as one continuous workflow rather than separate screens.

Additional work includes:

* improving GPS and navigation behavior
* improving arrival handling
* improving offline/network recovery
* refining responsive layouts
* improving assignment creation UX
* final notification verification
* production routing configuration
* final end-to-end testing

## Product Requirements

### Notifications

Important notifications should be available inside FieldFlow and, when supported and permitted, delivered through browser/OS push notifications so users can receive important updates even when the application is not the active browser tab.

### User Experience

The application should always clearly communicate:

* what is happening
* whether an action succeeded
* whether something failed
* what the user should do next
* whether the device is offline or synchronizing

The goal is to minimize unnecessary navigation, repeated actions, and user confusion.

### Professional Design

FieldFlow is intended to provide a consistent and professional experience across:

* Desktop
* Laptop
* Tablet
* Mobile

The interface is being refined to ensure consistent layouts, accessible controls, responsive forms, clear feedback, and practical field use.

## Development

Install frontend dependencies:

```bash
npm ci
```

Build the frontend:

```bash
npm run build
```

Install backend dependencies:

```bash
npm --prefix server ci
```

Validate the backend:

```bash
npm --prefix server run validate
```

Local development uses HTTPS:

```text
https://localhost:5173
```

The port may change if the default port is already in use, but development HTTPS must be preserved.

## Environment & Security

Production configuration should provide the required database, authentication, CORS, cookie, and Web Push settings.

Never commit:

```text
.env
JWT secrets
database credentials
VAPID private keys
production private keys
development certificates
```

Production should use trusted HTTPS/TLS rather than development certificates.

## Production Readiness

FieldFlow is currently in the **final development and integration stage**.

The remaining work is primarily focused on:

* completing the full Driver workflow
* verifying real road navigation in practice
* completing arrival and collection flow
* improving network/offline resilience
* final notification testing
* responsive and UX polishing
* production routing configuration
* deployment configuration
* final end-to-end QA

## Goal

The goal is to deliver FieldFlow as a **secure, reliable, professional, and deployable field-operations platform** that connects assignment management, navigation, GPS tracking, barcode-based collection, sample management, and notifications into one coherent workflow.
