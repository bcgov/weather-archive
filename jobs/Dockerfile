FROM python:3.14-slim

WORKDIR /app

COPY ./jobs/merge_job.py .

RUN pip install --no-cache-dir boto3

CMD ["python", "/app/merge_job.py"]
