🚨 Safe Shelter: Disaster Management Command Center

🌍 Overview

Safe Shelter is an enterprise-grade Decision Support System (DSS) engineered to optimize disaster response and logistics. Built with a Domain-Driven Design approach, it provides a real-time, centralized Command Center for crisis management, resource allocation, and predictive telemetry.

✨ Core Capabilities (Executive Dashboard)

🗺️ Interactive GIS Mapping: Real-time spatial visualization of standard distribution zones and central logistical hubs utilizing React-Leaflet.

🤖 Predictive Analytics (Burn Rate AI): Algorithmic estimation of resource depletion (e.g., predicting water shortages based on active zone occupation vs. capacity thresholds).

📦 Smart Logistics Operations: Asymmetrical stock dispatching integrated with automated PostgreSQL triggers and comprehensive activity logging.

🔒 Enterprise Security: Role-Based Access Control (RBAC) and Privileged Access Management with robust bcrypt password hashing and cascading database constraints.

🏗️ Technical Architecture

The system is structured as a Monorepo containing:

/frontend: React.js (Vite) + TailwindCSS for a data-dense, highly responsive UI.

/backend: Node.js + Express.js RESTful API architecture.

/Database: Raw SQL scripts for structural schema, relational integrity, and procedural triggers.

🚀 Quick Start (Local Deployment)

1. Database Setup

Open pgAdmin and initialize a new database named safe_shelter_db.

Restore the schema using the provided database_setup.sql dump file.

2. Environment Configuration

Create a .env file in the /backend directory:

DB_USER=postgres
DB_PASSWORD=<YOUR_SECURE_PASSWORD>
DB_HOST=localhost
DB_PORT=5432
DB_NAME=safe_shelter_db
PORT=5000


3. System Initialization

Open two terminal instances to launch the environment:

Terminal 1 (Backend Service):

cd backend
npm install
node server.js


Terminal 2 (Frontend Client):

cd frontend
npm install
npm run dev


Navigate to http://localhost:5173 to access the Command Center interface.

Architected & Developed by:

🧠 Ahmed El Hafiane * 🧠 El Hart Hamza * 🧠 Fatima EL Kazdir Engineering Students (Data Science, Big Data & AI) @ ENSIASD - Taroudant
