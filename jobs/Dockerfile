FROM python:3.14-slim@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170

WORKDIR /app

COPY ./jobs/requirements.txt .

RUN pip install --no-cache-dir --require-hashes -r requirements.txt && pip check \
	&& pip uninstall -y pip \
	&& rm -rf /usr/local/lib/python3.14/ensurepip/_bundled

COPY ./jobs/merge_job.py .

CMD ["python", "/app/merge_job.py"]
