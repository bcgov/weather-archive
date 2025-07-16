FROM python:3.12-slim

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN pip install minio

COPY upload_script.py .
COPY sensors.json .
COPY wait-and-run.sh .

RUN chmod +x wait-and-run.sh

CMD ["./wait-and-run.sh"]