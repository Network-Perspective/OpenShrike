# OpenShrike Runtime Config

- Main OpenCode config: `opencode.json`
- Required container env vars: `required-env.txt`
- Example env file: `runtime.env.example`

The JSON file is regular OpenCode configuration with `${ENV_VAR}` placeholders.
Secrets and environment-specific endpoints stay out of git; pass them in at runtime.
Keep secrets out of the repo by passing them at runtime, for example via `--env-file`.
