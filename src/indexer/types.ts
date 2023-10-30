import { z } from "zod";

export const HexSchema = z.custom<`0x${string}`>((str) => {
  return typeof str === "string" && str.startsWith("0x");
}, "Must start with 0x");

export const MetaPtrSchema = z.object({
  pointer: z.string(),
});

export const RoundSchema = z.object({
  id: HexSchema,
  amountUSD: z.number(),
  votes: z.number(),
  token: z.string(),
  matchAmount: z.string(),
  matchAmountUSD: z.number(),
  uniqueContributors: z.number(),
  applicationMetaPtr: z.string(),
  applicationMetadata: z.unknown().nullable(),
  metaPtr: z.string(),
  metadata: z
    .object({
      name: z.string(),
      quadraticFundingConfig: z.object({
        matchingFundsAvailable: z.optional(z.number()),
        sybilDefense: z.optional(z.boolean()),
        matchingCap: z.optional(z.boolean()),
        matchingCapAmount: z.optional(z.number()),
        minDonationThreshold: z.optional(z.boolean()),
        minDonationThresholdAmount: z.optional(z.number()),
      }),
    })
    .deepPartial()
    .nullable(),
  applicationsStartTime: z.string(),
  applicationsEndTime: z.string(),
  roundStartTime: z.string(),
  roundEndTime: z.string(),
  createdAtBlock: z.number(),
  updatedAtBlock: z.number(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  metaPtr: z.string().nullable(),
  owners: z.array(z.string()),
  createdAtBlock: z.number(),
  projectNumber: z.number(),
  metadata: z
    .object({
      title: z.string(),
      description: z.string(),
      website: z.string(),
      projectTwitter: z.string(),
      projectGithub: z.string(),
      userGithub: z.string(),
      logoImg: z.string(),
      createdAt: z.number(),
    })
    .partial()
    .nullable(),
});

export const ContributorSchema = z.object({
  id: z.string(),
  amountUSD: z.number(),
  votes: z.number(),
});

export const ApplicationStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "IN_REVIEW",
]);

export const ApplicationSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  roundId: z.string(),
  status: ApplicationStatusSchema,
  amountUSD: z.number(),
  votes: z.number(),
  uniqueContributors: z.number(),
  metadata: z
    .object({
      application: z.object({
        project: z.object({
          title: z.string(),
          website: z.string(),
          projectTwitter: z.string().optional(),
          projectGithub: z.string().optional(),
          userGithub: z.string().optional(),
        }),
        answers: z.array(
          z.object({
            question: z.string(),
            encryptedAnswer: z
              .object({
                ciphertext: z.string(),
                encryptedSymmetricKey: z.string(),
              })
              .optional(),
            answer: z.string().or(z.array(z.string())).optional(),
          })
        ),
        recipient: z.string(),
      }),
    })
    .nullable(),
  createdAtBlock: z.number(),
  statusUpdatedAtBlock: z.number(),
  statusSnapshots: z.array(
    z.object({
      status: ApplicationStatusSchema,
      statusUpdatedAtBlock: z.number(),
    })
  ),
});

export const VoteSchema = z.object({
  id: z.string(),
  transaction: HexSchema,
  blockNumber: z.number(),
  projectId: z.string(),
  roundId: z.string(),
  applicationId: z.string(),
  token: z.string(),
  voter: z.string(),
  grantAddress: z.string(),
  amount: z.string(),
  amountUSD: z.number(),
  amountRoundToken: z.string(),
});

export type Hex = z.infer<typeof HexSchema>;
export type MetaPtr = z.infer<typeof MetaPtrSchema>;
export type Round = z.infer<typeof RoundSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Contributor = z.infer<typeof ContributorSchema>;
export type Application = z.infer<typeof ApplicationSchema>;

export type Vote = z.infer<typeof VoteSchema>;
