type ipfsGetFn = <T>(cid: string) => Promise<T | undefined>;

type Metadata = {
  round: unknown;
  application: unknown;
};

export async function fetchPoolMetadata(ipfsGet: ipfsGetFn, cid: string) {
  let roundMetadata: Metadata["round"] | null;
  let applicationMetadata: Metadata["application"] | null;
  const metadata = await ipfsGet<Metadata | undefined>(cid);

  if (metadata !== undefined && metadata.round !== undefined) {
    roundMetadata = metadata.round;
  }

  if (metadata !== undefined && metadata.application !== undefined) {
    applicationMetadata = metadata.application;
  }

  return { roundMetadata, applicationMetadata };
}
