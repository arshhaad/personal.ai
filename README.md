# Personal AI — Your Own Knowledge AI

A full-stack, knowledge-grounded AI assistant application inspired by ChatGPT and Gemini. Personal AI allows users to upload private documents (PDF, DOCX, TXT, MD), customize AI response styles, and interact with an intelligent conversational assistant strictly bounded to their personal knowledge base.

---

## 🌟 Key Features

- **Google OAuth 2.0 Authentication:** Seamless, secure one-tap Google authentication with JWT session management.
- **Private Knowledge Base & Document Isolation:**
  - Multi-user document storage isolated by `user_id`.
  - Automatic synchronous and background text extraction and indexing.
- **Strict Knowledge Boundary Directives:**
  - AI responses strictly ground on uploaded documents and user profile information.
  - Declines unrelated queries with: *"Sorry, I can't provide this {topic}. You didn't mention any information about this."*
- **Structured Responses:**
  - Structured bullet points, bold key terms, and scannable technical summaries.
- **ChatGPT & Gemini-Inspired User Interface:**
  - Left-aligned assistant reading pane with markdown rendering, syntax highlighting, copy-to-clipboard, feedback, and regeneration controls.
  - Right-aligned user pills with avatars.
  - Sidebar with conversation history, active badges, inline renaming, deletion, and document counters.
- **Dual-Mode Theme Support:**
  - Default sleek modern dark mode and clean professional light mode.
- **3-Second Ephemeral Toast Notifications:**
  - Smooth animated top-right modal notifications with dynamic progress countdown lines.
- **Fully Responsive Design:**
  - Optimized for desktop, tablet, and mobile screens.

---

## 🐳 Run with Docker (Recommended)

The Docker Compose configuration containerizes both the Django REST backend and Vite React frontend, with persistent volumes for SQLite and uploaded media.

### 1. Configure Environment Variables

```bash
# Backend credentials
cp backend/.env.example backend/.env

# Frontend credentials (optional)
cp frontend/.env.example frontend/.env
```

Add your API keys to `backend/.env`:
- `GROQ_API_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### 2. Launch the Stack

```bash
docker compose up --build
```

- **Frontend:** [http://localhost:5173](http://localhost:5173)
- **Backend API & Health Check:** [http://localhost:8000/api/health/](http://localhost:8000/api/health/)

To stop the containers:
```bash
docker compose down
```
*(Your database and uploaded documents are preserved across restarts in the `backend_data` and `backend_media` volumes).*

---

## 🛠️ Local Development (Without Docker)

### Prerequisites
- Node.js (v18+) & npm
- Python (v3.11+)

### 1. Backend Setup

```bash
cd backend
python -m venv .venv

# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env

cd self_company
python manage.py migrate
python manage.py test ai_company
python manage.py runserver 8000
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🔒 Security & Privacy

- All sensitive credentials and API keys are managed exclusively via environment variables and excluded via `.gitignore` and `.dockerignore`.
- User documents and memory entries are strictly segmented by foreign-key relationship to the authenticated user ID.
- Tokens are encrypted and handled via standard HTTP authorization headers.

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
