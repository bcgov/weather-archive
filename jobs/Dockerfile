FROM python:3.15-slim@sha256:2da676046630d7bf14c6764ae1143dc7fa0377a53f94bf5a642f0b214aca5bce

WORKDIR /app

COPY ./jobs/requirements.txt .

RUN pip install --no-cache-dir --only-binary :all: --require-hashes -r requirements.txt && pip check \
	&& pip uninstall -y pip \
	&& rm -rf /usr/local/lib/python3.14/ensurepip/_bundled

COPY ./jobs/merge_job.py .

USER 1001:0

CMD ["python", "/app/merge_job.py"]
