# Barcode Scan Gemini Project

This project contains a web application for scanning barcodes, consisting of a Next.js frontend and a Python backend. It utilizes Docker Compose for easy setup and deployment.

## Project Structure

*   `/frontend`: Contains the Next.js frontend application source code.
*   `/backend`: Contains the Python backend application source code (likely Flask/FastAPI).
*   `docker-compose.yml`: Defines the services, networks, and volumes for Docker Compose.
*   `Dockerfile` (in `frontend` and `backend`): Instructions for building the Docker images for each service.
*   `README.md`: This file.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

*   **Node.js:** (e.g., v18 or later) - Required for the frontend. [Download Node.js](https://nodejs.org/)
*   **npm or yarn:** Package manager for Node.js.
*   **Python:** (e.g., v3.9 or later) - Required for the backend. [Download Python](https://www.python.org/)
*   **pip:** Package installer for Python.
*   **Docker:** Containerization platform. [Install Docker](https://docs.docker.com/get-docker/)
*   **Docker Compose:** Tool for defining and running multi-container Docker applications. [Install Docker Compose](https://docs.docker.com/compose/install/)

## Development Setup

You can run the frontend and backend services separately for development or use Docker Compose.

### Option 1: Running Services Locally (Without Docker)

**1. Backend Setup:**

```bash
# Navigate to the backend directory
cd backend

# Create and activate a virtual environment (recommended)
python -m venv venv
# On Linux/macOS:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the backend server (adjust command if needed, e.g., uvicorn main:app --reload for FastAPI)
python main.py
```
The backend should now be running (check `main.py` or framework docs for the default port, often 5000 or 8000).

**2. Frontend Setup:**

```bash
# Navigate to the frontend directory (from project root)
cd frontend

# Install dependencies
npm install
# or
# yarn install

# Run the frontend development server
npm run dev
# or
# yarn dev
```
The frontend should now be running, typically on `http://localhost:3000`. Remember to navigate back to the root directory (`cd ..`) before running backend commands if needed.

### Option 2: Running Services with Docker Compose (Recommended)

This is the easiest way to get the entire application stack running consistently.

**1. Build and Start Containers:**

```bash
# Ensure you are in the project root directory (/data/barcodescan)
# Build the images and start the containers
docker-compose up --build
```
*   `--build`: Forces Docker to rebuild the images based on the Dockerfiles. Omit this flag after the initial build if the Dockerfiles or their dependencies haven't changed.
*   This command will build the images for both the frontend and backend services and then start the containers defined in `docker-compose.yml`.
*   You will see interleaved logs from both services in your terminal.

**2. Accessing the Application:**

*   **Frontend:** Open your web browser and navigate to `http://localhost:3000` (or the port mapped in `docker-compose.yml` for the `frontend` service).
*   **Backend API:** The backend API will be accessible on the port mapped in `docker-compose.yml` for the `backend` service (e.g., `http://localhost:8000`). The frontend is likely configured to communicate with the backend service name (`backend`) within the Docker network.

**3. Stopping Containers:**

*   Press `Ctrl + C` in the terminal where `docker-compose up` is running to stop the services gracefully.
*   To stop and remove the containers, networks, and potentially volumes created by `up`, run:
    ```bash
    docker-compose down
    ```
    Use `docker-compose down -v` to also remove named volumes.

**4. Other Useful Docker Compose Commands:**

*   `docker-compose ps`: List running containers managed by Compose for this project.
*   `docker-compose logs`: View logs from all services.
*   `docker-compose logs -f <service_name>`: Follow logs in real-time for a specific service (e.g., `frontend`, `backend`).
*   `docker-compose exec <service_name> <command>`: Execute a command inside a running container (e.g., `docker-compose exec backend bash` to get a shell in the backend container).
*   `docker-compose build <service_name>`: Build or rebuild the image for a specific service.
*   `docker-compose pull`: Pull the latest base images defined in the Dockerfiles.

## Contributing

(Contribution guidelines can be added here.)

## License

(License information can be added here.)