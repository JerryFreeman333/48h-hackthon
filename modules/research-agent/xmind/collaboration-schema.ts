import {z} from 'zod';
export const collaborationSchema=z.strictObject({
 schemaVersion:z.literal('xmind-collaboration/1'),runId:z.string(),status:z.enum(['running','completed','partial','blocked']),
 stopReason:z.string().nullable(),rounds:z.number().int().nonnegative(),
 tasks:z.array(z.strictObject({id:z.string(),agent:z.string(),engine:z.enum(['rules','model']),status:z.enum(['queued','running','completed','failed','blocked']),dependsOn:z.array(z.string()),after:z.array(z.string()).default([]),reason:z.string().nullable()})).max(400),
 messages:z.array(z.strictObject({id:z.string(),fromTaskId:z.string(),toTaskId:z.string(),kind:z.string()})).max(400),
 tools:z.array(z.strictObject({id:z.string(),taskId:z.string(),tool:z.string(),engine:z.enum(['rules','model']),effect:z.enum(['read_only','external','model']),status:z.enum(['pending','completed','rejected']),reason:z.string().nullable()})).max(400)
});
export type XmindCollaboration=z.infer<typeof collaborationSchema>;
