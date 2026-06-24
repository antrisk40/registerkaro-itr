# RegisterKaro ITR Automation Portal

This repository contains a full-stack, event-driven automation platform built to streamline the user registration and recovery process on the Income Tax Department (ITR) e-Portal. 

It handles automated navigation, form-filling, dynamic state transitions (e.g., pivoting to password recovery if a PAN is registered), and real-time bidirectional communication for OTP delivery.

## Prerequisites

To run this project locally in under 10 minutes, you will need:
- **Node.js**: v18 or higher (v20+ recommended)
- **MongoDB**: A local or cloud MongoDB instance running (default port `27017`)
- **Git**: To clone the repository

## Environment Variables

Each layer of the application requires its own `.env` file. You can find reference variables in the root `.env.example` file.

1. **Service Layer (`service/.env`)**:
   Create a `.env` file inside the `service/` directory:
   ```env
   PORT=4000
   MONGO_URI=mongodb://localhost:27017/registerkaro
   WEBHOOK_SECRET=my_super_secret_webhook_token
   JWT_SECRET=change-this-jwt-secret-in-production
   JWT_EXPIRES_IN=7d
   ADMIN_PASSWORD=admin123
   SPOC_PASSWORD=spoc123
   ENCRYPTION_KEY=32-char-hex-or-passphrase-for-aes
   ```

2. **Automation Layer (`automation/.env`)**:
   Create a `.env` file inside the `automation/` directory:
   ```env
   WEBHOOK_URL=http://localhost:4000/webhook/events
   API_URL=http://localhost:4000/api
   WEBHOOK_SECRET=my_super_secret_webhook_token
   ```

3. **UI Layer (`ui/.env`)**:
   Create a `.env` file inside the `ui/` directory:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:4000/api
   MONGO_URI=mongodb://localhost:27017/registerkaro
   ```

## Installation & Starting the Application

The project is structured into three main layers: `service` (Backend API), `ui` (Frontend Dashboard), and `automation` (Playwright Engine).

**Step 1: Install Dependencies**
At the root of the project, install dependencies for all layers concurrently:
```bash
npm run install:all
```
*(Alternatively, you can run `npm install` inside the root, `service/`, `ui/`, and `automation/` directories manually).*

**Step 2: Start All Layers Concurrently**
Start the entire stack (UI, Service) from the root folder:
```bash
npm run dev:all
```
This will start:
- **Frontend (UI)**: [http://localhost:3000](http://localhost:3000)
- **Backend (Service)**: [http://localhost:4000](http://localhost:4000)

*Note: The `automation` layer scripts are triggered dynamically by the `service` layer via spawned Node.js child processes when a job is initiated, so you do not need to run the automation layer continuously.*

## How to Trigger a Run

1. **Access the Dashboard:**
   Open [http://localhost:3000](http://localhost:3000) in your browser. 
2. **Login:**
   Login using the default Admin credentials (from your `.env` file):
   - **Username**: `admin`
   - **Password**: `admin123`
3. **Create a Job:**
   Navigate to the **New Job** / **Dashboard** section. Fill in the required details: Target PAN, Aadhaar Number, and basic user information.
4. **Start Automation:**
   Click **Submit** or **Start Job**. The backend will spawn a Playwright process.
5. **Watch the Magic:**
   You will automatically be redirected to the Job Details page. Here, you can watch live events stream in as the bot navigates the portal.
6. **Provide OTPs:**
   When the automation reaches an OTP verification stage, it will pause and prompt you on the dashboard. Enter the OTP in the provided UI field, and the bot will instantly resume its execution!
