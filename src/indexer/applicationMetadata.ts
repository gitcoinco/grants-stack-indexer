import { z } from "zod";

export const ApplicationMetadataSchema = z
  .object({
    application: z.object({
      round: z.string(),
      recipient: z.string(),
    }),
  })
  .transform((data) => ({ type: "application" as const, ...data }));

export type ApplicationMetadata = z.infer<typeof ApplicationMetadataSchema>;
