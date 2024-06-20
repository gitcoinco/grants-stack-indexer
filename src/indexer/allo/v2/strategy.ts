type Strategy = {
  id: string;
  name: string | null;
  groups: string[];
};

export function extractStrategyFromId(_id: string): Strategy | null {
  const id = _id.toLowerCase();
  /* eslint-disable no-fallthrough */
  switch (id) {
    case "0x02ce039501668fadbe8b9ef4030e619cf4eefbc3d70415b61ebdfd3c5d467ad2":
      return {
        id: id,
        name: "allov2.MACIQF",
        groups: ["allov2.MACIQF"],
      };
  }

  return null;
}
