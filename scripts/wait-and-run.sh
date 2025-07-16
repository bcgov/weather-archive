#!/bin/bash
echo "Waiting for MinIO to be ready..."
until curl -f http://minio:9000/minio/health/ready 2>/dev/null; do
    echo "MinIO not ready, waiting..."
    sleep 2
done
echo "MinIO is ready, running upload script..."
python upload_script.py