#!/usr/bin/env python3
import json
import os
import io
from minio import Minio
import concurrent.futures
import random

# Configuration
BUCKET_NAME = "paws"
YEARS = [2022, 2023, 2024, 2025]
JSON_FILE = "sensors.json"

def create_minio_client():
    """Create MinIO client using environment variables."""
    return Minio(
        os.getenv('MINIO_ENDPOINT', 'localhost:9000'),
        access_key=os.getenv('MINIO_ACCESS_KEY'),
        secret_key=os.getenv('MINIO_SECRET_KEY'),
        secure=os.getenv('MINIO_SECURE', 'false').lower() == 'true'
    )

def upload_single(minio_client, sensor_id, year, month):
    """Upload one CSV file."""
    filename = f"{sensor_id}_{year}_{month:02d}.csv"
    data = b"test"
    
    try:
        minio_client.put_object(
            BUCKET_NAME,
            filename,
            io.BytesIO(data),
            len(data),
            content_type="text/csv"
        )
        print(f"Uploaded {filename}")
        return True
    except Exception as e:
        print(f"Failed {filename}: {e}")
        return False

def main():
    # Load sensors
    with open(JSON_FILE, 'r') as f:
        sensors = [item['id'] for item in json.load(f) if 'id' in item]
    
    # Create client and ensure bucket exists
    client = create_minio_client()
    if not client.bucket_exists(BUCKET_NAME):
        client.make_bucket(BUCKET_NAME)
    else:
        # Check if bucket has any objects
        objects = list(client.list_objects(BUCKET_NAME, recursive=True))
        if objects:
            print(f"Bucket '{BUCKET_NAME}' already contains data. Skipping upload.")
            return
    
    # Generate and upload files
    tasks = []
    for sensor_id in sensors:
        for year in YEARS:
            # Random 2-4 months per sensor per year
            months = random.sample(range(1, 13), random.randint(2, 4))
            for month in months:
                tasks.append((sensor_id, year, month))
    
    # Upload in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(upload_single, client, sensor_id, year, month) 
                  for sensor_id, year, month in tasks]
        
        successful = sum(1 for f in concurrent.futures.as_completed(futures) if f.result())
    
    print(f"\nCompleted: {successful}/{len(tasks)} files uploaded")

if __name__ == "__main__":
    main()