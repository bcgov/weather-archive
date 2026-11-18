FROM python:3.15-slim@sha256:65a65fc7b30b06cb6df4930fd4650697cb23f4c2698ab81fc87e4b031bc36928

WORKDIR /app

COPY ./jobs/requirements.txt .

RUN pip install --no-cache-dir --only-binary :all: --require-hashes -r requirements.txt && pip check \
	&& pip uninstall -y pip

COPY ./jobs/merge_job.py .

USER 1001:0

CMD ["python", "/app/merge_job.py"]
