import { z } from "zod";

export const RoundMetadataSchema = z
  .object({
    name: z.string(),
    roundType: z.union([z.literal("private"), z.literal("public")]),
    quadraticFundingConfig: z.object({
      matchingFundsAvailable: z.number(),
    }),
  })
  .passthrough();
