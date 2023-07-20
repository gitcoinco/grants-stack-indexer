export { default as ProjectRegistryV2 } from "./v2/ProjectRegistry.json";

import { default as MyABIv1 } from "./v1/MyABI.json";
import { default as MyABIv2 } from "./v2/MyABI.json";
export const MyABICombined = merge(MyABIv1, MyABIv2);
