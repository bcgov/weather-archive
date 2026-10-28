FROM python:3.15-slim@sha256:94d3426f1def7db4a106a232ac121bfd975393e5dfd40a619b955fae45fe7913

WORKDIR /app

COPY ./jobs/requirements.txt .

RUN pip install --no-cache-dir --only-binary :all: --require-hashes -r requirements.txt && pip check \
	&& pip uninstall -y pip

COPY ./jobs/merge_job.py .

USER 1001:0

CMD ["python", "/app/merge_job.py"]
