FROM python:3.12-slim

WORKDIR /app

COPY packages/docker-shim/pyproject.toml /app/packages/docker-shim/pyproject.toml
COPY packages/docker-shim/src /app/packages/docker-shim/src
COPY packages/shared/src/data/sandbox-profiles.json /app/sandbox-profiles.json

RUN pip install --no-cache-dir /app/packages/docker-shim

EXPOSE 8000

CMD ["uvicorn", "codebreaker_docker_shim.main:create_fastapi_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
