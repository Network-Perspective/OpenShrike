# Security Model

## Core requirements
- Zero trust: assume agents are untrusted and potentially adversarial.
- Least privilege: agents only see the files and context they need.
- No secrets exposure: tokens, keys, and credentials are never accessible.
- Deterministic isolation: all CLI actions occur in sandboxed containers by
  default, with explicit opt-out only when an equivalent CI sandbox is present.
- Auditability: every action is logged with inputs, outputs, and hashes.

## Deployment tiers

### Standard mode (local development)
- Opencode runs natively with read-only agent permissions.
- The agent permission config is the security boundary.
- Suitable for individual developers on their own workstations.
- No containers required; fast and zero setup friction.
- Example opencode permission config:
  ```json
  {
    "agent": {
      "review": {
        "permission": {
          "bash": {
            "git push": "deny",
            "rm *": "deny",
            "grep *": "allow",
            "rg *": "allow"
          }
        }
      }
    }
  }
  ```

### Hardened mode (CI / enterprise)
- Opencode runs inside an isolated container (Docker, Podman, or equivalent).
- No network, no secrets mounted, read-only filesystem.
- The container is the security boundary; agent permissions are defense-in-depth.
- Suitable for CI pipelines, shared infrastructure, and enterprise environments.
- Optional gVisor or Firecracker for stronger isolation.
- Read-only mounts for code; write access limited to scratch space.
- Explicit allowlist for tools and commands available to the agent.
- Network access disabled by default; allowlisted only when necessary.

## Data handling
- Sensitive files are masked or withheld from agent context.
- Inputs are categorized: public, internal, secret. Only public/internal allowed.
- Redaction pass for logs before any export or feedback output.
- Policy assembler limits context by emitting only the checks selected.

## Threats and mitigations
- Prompt injection in repo files: treat repo content as untrusted input.
- Agent exfiltration attempts: block network and restrict filesystem scope.
- Dependency confusion: use locked, hashed dependencies in containers.
- Log leakage: hash or redact sensitive tokens before storage.

## Security testing
- Sandbox escape tests and negative test cases for tool allowlists.
- Reproducible builds for the execution environment.
- Regular review of container image provenance and SBOMs.
