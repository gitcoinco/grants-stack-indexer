import { z } from "zod";

export const ProjectMetadataSchema = z.union([
  z
    .object({
      title: z.string(),
      description: z.string(),
    })
    .passthrough()
    .transform((data) => ({ type: "project", ...data })),
  z
    .object({
      canonical: z.object({
        registryAddress: z.string(),
        chainId: z.coerce.number(),
      }),
    })
    .transform((data) => ({ type: "project", ...data })),
  z.object({
    type: z.literal("program"),
    name: z.string(),
  }),
  z
    .object({
      name: z.string(),
    })
    .transform((data) => ({ type: "program", ...data })),
]);

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;
