# personal.ai

## Run with Docker

The Docker Compose setup runs the Django API at `http://localhost:8000` and the
Vite frontend at `http://localhost:5173`. It persists the SQLite database and
uploaded media in named Docker volumes.

1. Copy `backend/.env.example` to `backend/.env` and
   `frontend/.env.example` to `frontend/.env`, then add your credentials.
   The env files are optional for starting the containers, but API keys and the
   Google OAuth client ID are needed for their related features.
2. Start the stack:

   ```sh
   docker compose up --build
   ```

3. Open `http://localhost:5173`. Stop the containers with `Ctrl+C`; run
   `docker compose down` to remove the containers while keeping persisted data.

This Compose configuration is intended for local development, not production
deployment.