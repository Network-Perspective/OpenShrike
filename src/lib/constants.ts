export const DEFAULT_AGENT_NAME = 'shrike-checker';
export const DEFAULT_MODEL = 'azure/gpt-5.4-mini';
export const DEFAULT_PROVIDER = 'azure';
export const DEFAULT_OUTPUT = 'json';
export const DEFAULT_SCAN_SCOPE = 'uncommitted';

export const CONFIG_DIRECTORY_NAME = '.openshrike';
export const CONFIG_FILE_NAME = 'opencode.json';
export const RUNTIME_ENV_FILE_NAME = 'runtime.env';
export const RUNTIME_ENV_EXAMPLE_FILE_NAME = 'runtime.env.example';
export const REQUIRED_ENV_FILE_NAME = 'required-env.txt';
export const INIT_README_FILE_NAME = 'README.md';

export const SCOPE_VALUES = ['uncommitted', 'commit', 'branch', 'pr', 'full'] as const;
export const OUTPUT_VALUES = ['json', 'markdown'] as const;

export const STREAM_EVENT_LIMIT = 120;
export const STREAM_TEXT_LIMIT = 2400;
export const MAX_POLICY_CHECKS = 50;
export const OPENCODE_REQUEST_TIMEOUT_MS = 120_000;
export const OPENCODE_DELETE_TIMEOUT_MS = 5_000;
export const OPENCODE_POLL_TIMEOUT_MS = 90_000;
export const OPENCODE_SERVER_START_TIMEOUT_MS = 5_000;
export const OPENCODE_SERVER_CLOSE_TIMEOUT_MS = 5_000;

export const AZURE_API_KEY_ENV = 'AZURE_OPENAI_API_KEY';
export const AZURE_BASE_URL_ENV = 'OPENSHRIKE_AZURE_OPENAI_BASE_URL';
export const AZURE_API_VERSION_ENV = 'OPENSHRIKE_AZURE_OPENAI_API_VERSION';
