import { Strategy } from "../../types.js";

export function extractStrategyFromId(_id: string): Strategy | null {
  const id = _id.toLowerCase();
  /* eslint-disable no-fallthrough */
  switch (id) {
    // MACIQFStrategyv1.0
    case "0x478377bfef9c80477e88f27c6de01e497e6747f54d8b77e564c0445ddc67448b":
      return {
        id: id,
        name: "allov2.MACIQF",
        groups: ["allov2.MACIQF"],
      };
  }

  return null;
}
