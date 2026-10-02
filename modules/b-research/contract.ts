export * from "../../packages/contracts";
import { searchIntentSchema as sharedSearchIntentSchema } from "../../packages/contracts";

// The prototype cap is a B service policy, not a shared schema constraint.
export const searchIntentSchema = sharedSearchIntentSchema.extend({
  maxCandidates: sharedSearchIntentSchema.shape.maxCandidates.max(3)
});
