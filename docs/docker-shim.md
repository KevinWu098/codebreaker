# Docker Shim

The Docker shim is a local Docker-backed implementation of the sandbox HTTP API used by the control plane's `ModalExecutor`. It mirrors the Modal shim contract so existing sessions and benchmark flows can point `MODAL_SHIM_URL` at a Docker-hosted service.

## Run Locally

From the repository root:

```bash
SHIM_SECRET=dev-shim-secret pnpm run dev:docker-shim
```

The service listens on `http://localhost:8000` by default and uses Docker's standard environment discovery. For the common local case, make sure the Docker daemon is running and the current user can access it.

To run the shim itself in Docker:

```bash
SHIM_SECRET=dev-shim-secret docker compose -f packages/docker-shim/docker-compose.yml up --build
```

The compose setup mounts `/var/run/docker.sock` so the shim can create per-session sandbox containers on the host.

## Remote Docker Hosts

The shim uses the Docker SDK's standard environment variables. Set these before starting the service when targeting a remote daemon:

```bash
DOCKER_HOST=tcp://docker.example.com:2376
DOCKER_TLS_VERIFY=1
DOCKER_CERT_PATH=/path/to/certs
SHIM_SECRET=dev-shim-secret
pnpm run dev:docker-shim
```

## Control Plane Configuration

Configure the control plane to use the Docker shim through the existing shim settings:

```text
MODAL_SHIM_URL=http://localhost:8000
MODAL_SHIM_SECRET=dev-shim-secret
```

The endpoint names, request bodies, auth header, and response shapes match the Modal shim, including `/exec`, `/read`, `/write`, `/git/checkout`, `/git/commit`, `/terminate`, `/snapshot`, and sandbox metadata routes.

## Notes

- Sandbox profiles come from `packages/shared/src/data/sandbox-profiles.json`.
- Profile `installCommands` are baked into a Docker image tagged by the profile fingerprint.
- `/snapshot` is kept for compatibility and returns `supported: false`.
- `encryptedPorts` is Modal-specific and is not implemented by the Docker shim.
