type Strategy = {
  id: string;
  name: string | null;
  groups: string[];
};

export function extractStrategyFromId(_id: string): Strategy | null {
  const id = _id.toLowerCase();
  /* eslint-disable no-fallthrough */
  switch (id) {
    case "0x9b167da08fc4d96c2bda5fa376d9c734f55bc41f7b5de98280322597dfb097ed":
      return {
        id: id,
        name: "allov2.MACIQF",
        groups: ["allov2.MACIQF"],
      };
  }

  return null;
}
