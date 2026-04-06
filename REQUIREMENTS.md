# 📋 Software Requirements Specification (SRS)
**Project:** Safe Shelter - Disaster Management Command Center  
**Module:** Domain-Driven Design & Full-Stack Architecture  

---

## 1. 🎯 Besoins Fonctionnels (Functional Requirements)
The core capabilities the system MUST provide to end-users (Command Center Operators):

### 1.1. Gestion des Zones (Zone Management)
* **REQ-F-01:** The system must allow the Admin to create, read, update, and delete (CRUD) geographic disaster zones.
* **REQ-F-02:** Each zone must have defined parameters including capacity, current occupation, and risk priority level.
* **REQ-F-03:** Zones must be visualized in real-time on an interactive GIS map.

### 1.2. Gestion des Ressources & Logistique (Resource Logistics)
* **REQ-F-04:** The system must track inventory levels (water, food, medical supplies) in real-time.
* **REQ-F-05:** Automated alerts must be generated when a zone's resource stock falls below the predictive burn-rate threshold.
* **REQ-F-06:** The system must log every stock dispatch and update the database via procedural triggers.

### 1.3. Gestion des Utilisateurs (IAM - Identity & Access Management)
* **REQ-F-07:** The system must support Role-Based Access Control (RBAC) with at least two levels: `ADMIN` (God-Mode) and `MANAGER` (Zone-Specific).
* **REQ-F-08:** Admins must be able to assign specific Managers to specific distribution zones dynamically.

---

## 2. 🛡️ Besoins Non-Fonctionnels (Non-Functional Requirements)
The quality attributes, performance goals, and security constraints of the system.

### 2.1. Sécurité & Intégrité (Security)
* **REQ-NF-01 (Authentication):** All user passwords must be cryptographically hashed using `bcrypt` (saltRounds: 10) before database insertion. Plain text passwords must never be logged or returned in API payloads.
* **REQ-NF-02 (Data Integrity):** The database must utilize Foreign Key constraints (e.g., `ON DELETE CASCADE`) to prevent orphaned records when a zone or user is removed.

### 2.2. Performance & Fiabilité (Performance)
* **REQ-NF-03 (Latency):** API responses for the Command Center dashboard must resolve in under 200ms to ensure real-time situational awareness.
* **REQ-NF-04 (Architecture):** The system must follow a decoupled RESTful Monorepo architecture to allow independent scaling of the Node.js backend and React frontend.

### 2.3. Interface Utilisateur (UI/UX)
* **REQ-NF-05 (Design System):** The interface must utilize a dark-themed, data-dense enterprise layout optimized for prolonged Command Center monitoring without eye fatigue.

---

## 3. 🛠️ Stack Technologique (Tech Stack Matrix)

| Layer | Technology | Justification / Role |
| :--- | :--- | :--- |
| **Frontend** | React.js (Vite) | High-performance Virtual DOM for real-time dashboard updates. |
| **Styling** | TailwindCSS | Utility-first CSS for rapid, uniform enterprise UI design. |
| **Backend** | Node.js + Express.js | Asynchronous, event-driven architecture for handling multiple API requests. |
| **Database** | PostgreSQL | Robust relational structure for complex JOINs and ACID compliance. |
| **Mapping** | React-Leaflet | Open-source interactive GIS integration for spatial data. |
