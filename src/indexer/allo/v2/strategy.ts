type Strategy = {
  id: string;
  name: string | null;
  groups: string[];
};

export function extractStrategyFromId(_id: string): Strategy | null {
  const id = _id.toLowerCase();
  /* eslint-disable no-fallthrough */
  switch (id) {
    // MACIQFStrategyv1.0
    case "0x5cb291766d77b07996afdea9ec97c3641083207524cf83ec2385081425f36ae3":
    // MACIQF_STRATEGY_V1
    case "0x9b167da08fc4d96c2bda5fa376d9c734f55bc41f7b5de98280322597dfb097ed":
      return {
        id: id,
        name: "allov2.MACIQF",
        groups: ["allov2.MACIQF"],
      };
  }

  return null;
}
