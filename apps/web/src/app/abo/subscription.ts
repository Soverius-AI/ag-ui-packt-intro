import { z } from 'zod';

export const SubscriptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  perMonth: z.number(),
  lastUsed: z.string(),
  channel: z.enum(['online', 'fax']),
  exitFee: z.number().optional(),
  note: z.string().optional(),
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

export const ScanResultSchema = z.object({
  months: z.number(),
  transactions: z.number(),
  subscriptions: z.array(SubscriptionSchema),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

/** The arguments of choose_subscriptions: the agent's proposal, which the human reviews (ASK). */
export const ChooseArgsSchema = z.object({
  suggestions: z.array(
    z.object({
      id: z.string().describe('subscription id from scan_statements'),
      reason: z.string().describe('why it looks unused, a few words'),
    }),
  ),
});
export type ChooseArgs = z.infer<typeof ChooseArgsSchema>;

/** Content of the "scan" activity (SEE). */
export const ScanProgressSchema = z.object({
  done: z.number(),
  total: z.number(),
  month: z.string(),
  transactions: z.number(),
  found: z.number(),
});
export type ScanProgressContent = z.infer<typeof ScanProgressSchema>;

/** Content of one "cancellation" activity: one subagent's lane (DELEGATE). */
export const LaneSchema = z.object({
  provider: z.string(),
  status: z.enum(['writing', 'cancelled', 'failed']),
  letter: z.string(),
  confirmation: z.string().optional(),
  error: z.string().optional(),
});
export type LaneContent = z.infer<typeof LaneSchema>;

export function parseJson<T>(schema: z.ZodType<T>, text: string | undefined): T | undefined {
  try {
    const parsed = schema.safeParse(JSON.parse(text ?? ''));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
