# Job Craft

Job Craft is a comprehensive job application management and career optimization platform. It combines automated job scraping, a Kanban-style application tracker, AI-powered resume analysis, and career event monitoring to streamline the job search process.

## 🏗 Project Architecture

The project is structured into three primary modules:

- **`client/`**: A modern React frontend built with TypeScript, Tailwind CSS, and Vite. Features a drag-and-drop Kanban board for application tracking.
- **`server/`**: A Node.js Express API that handles data persistence via the InsForge SDK, manages user authentication, and integrates with Google APIs for Gmail monitoring.
- **`pipeline/`**: A robust data ingestion and processing engine that scrapes job listings from multiple sources (Greenhouse, Lever, Ashby, Indeed, etc.) and uses Anthropic's Claude AI for skill matching and resume optimization.

## 🚀 Key Features

### 📋 Job Application Tracking
- **Kanban Board**: Drag-and-drop interface (`@hello-pangea/dnd`) to manage job statuses (Wishlist, Applied, Interview, Offer, etc.).
- **Job Details**: Comprehensive tracking of job descriptions, company info, and application links.
- **Pipeline Management**: Ability to add jobs manually or via the automated pipeline.

### 🤖 Intelligent Pipeline
- **Multi-Source Scraping**: Automated scrapers for platforms like Arbeitnow, Ashby, Glassdoor, Greenhouse, Indeed, Lever, and more.
- **AI-Powered Analysis**: Uses Claude AI to match user skills with job descriptions and suggest resume optimizations.
- **ATS Discovery**: Automatically identifies Applicant Tracking Systems (ATS) used by companies.
- **Location & Seniority Filtering**: Targeted job discovery based on user preferences.

### 📄 Resume & Skills Management
- **Resume Pool**: Centralized management of different resume versions.
- **Skills Trend**: Visualization and tracking of required skills across the industry to identify growth areas.
- **PDF Generation**: Automated resume tailoring and PDF generation.

### 📧 Integrations
- **Gmail Integration**: Monitors career-related emails to automatically log interview invites and application updates.
- **InsForge Integration**: Leverages InsForge for secure database operations and authentication.

## 🛠 Tech Stack

### Frontend
- **Framework**: React 18
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **State/UI**: `@hello-pangea/dnd`, custom hooks for API interaction.

### Backend
- **Framework**: Express.js
- **Runtime**: Node.js
- **Database/Auth**: InsForge SDK
- **Integrations**: Google Cloud APIs (Gmail API), Multer (file uploads).

### Pipeline
- **Processing**: Anthropic Claude AI (Claude 3.5 Sonnet)
- **Scraping**: Cheerio, Fast-XML-Parser
- **Automation**: Custom orchestrator for multi-platform job ingestion.

## 🚦 Getting Started

### Prerequisites
- Node.js (v18+)
- InsForge project credentials
- Anthropic API Key (for pipeline features)
- Google Cloud Console project (for Gmail integration)

### Installation

1. **Install dependencies** (at root and in sub-modules):
   ```bash
   npm install
   cd client && npm install
   cd ../server && npm install
   cd ../pipeline && npm install
   ```

2. **Environment Configuration**:
   - Set up `.env` files in `server/` and `pipeline/` based on their respective `.env.example` files.

3. **Running the Application**:
   - **Frontend**: `cd client && npm run dev`
   - **Backend**: `cd server && npm run dev`
   - **Pipeline**: `cd pipeline && npm run pipeline`

## 📄 License
Privately owned project.
