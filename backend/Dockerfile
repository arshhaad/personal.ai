FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create directories for persistent SQLite DB, user media, and static files
RUN mkdir -p /data /media /app/staticfiles

# Copy project files
COPY self_company/ .

# Collect static files for production (uses build-time fallback key)
RUN DJANGO_SECRET_KEY=build-placeholder DJANGO_DEBUG=False python manage.py collectstatic --noinput

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health/')"

CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn self_company.wsgi:application --bind 0.0.0.0:8000 --workers 3 --threads 2 --timeout 120 --access-logfile - --error-logfile -"]
