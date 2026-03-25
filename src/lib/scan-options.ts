import {z} from 'zod';
import {
  DEFAULT_PARALLELISM,
  DEFAULT_OUTPUT,
  DEFAULT_RUNTIME_MODE,
  DEFAULT_SCAN_SCOPE,
  OUTPUT_VALUES,
  RUNTIME_MODE_VALUES,
  SCOPE_VALUES
} from './constants.js';
import type {ScanCommandOptions} from './types.js';

const parallelismSchema = z.union([
  z.literal('auto'),
  z.coerce.number().int().min(1)
]);

const scanOptionsSchema = z
  .object({
    checkId: z.string().trim().min(1).optional(),
    policyId: z.string().trim().min(1).optional(),
    repoPath: z.string().trim().min(1).default('.'),
    outputFormat: z.enum(OUTPUT_VALUES).default(DEFAULT_OUTPUT),
    agent: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    emitBundlePath: z.string().trim().min(1).optional(),
    scanScope: z.enum(SCOPE_VALUES).default(DEFAULT_SCAN_SCOPE),
    scanTarget: z.string().trim().min(1).optional(),
    mockOpencode: z.boolean().default(false),
    configPath: z.string().trim().min(1).optional(),
    logPath: z.string().trim().min(1).optional(),
    runtimeMode: z.enum(RUNTIME_MODE_VALUES).default(DEFAULT_RUNTIME_MODE),
    image: z.string().trim().min(1).optional(),
    artifactsDir: z.string().trim().min(1).optional(),
    parallelism: parallelismSchema.default(DEFAULT_PARALLELISM),
    ui: z.boolean().default(true)
  })
  .superRefine((value, ctx) => {
    const hasCheck = Boolean(value.checkId);
    const hasPolicy = Boolean(value.policyId);

    if (hasCheck === hasPolicy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Specify exactly one of: --check <CHECK_ID> or --policy <POLICY_ID>.'
      });
    }

    if (value.scanScope === 'commit' && !value.scanTarget) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scan scope 'commit' requires '--scan-target <COMMIT_OR_RANGE>'."
      });
    }

    if (value.scanScope === 'branch' && !value.scanTarget) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scan scope 'branch' requires '--scan-target <BASE_BRANCH>'."
      });
    }
  });

export function validateScanOptions(input: unknown): ScanCommandOptions {
  return scanOptionsSchema.parse(input);
}
