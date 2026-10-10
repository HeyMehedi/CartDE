import type { Extension } from "../cartde/extensions/types";
import freeDelivery from "./free-delivery";

/** Every extension this store ships with. Registering is not enabling: an administrator switches each one on. */
export const EXTENSIONS: readonly Extension[] = [freeDelivery];
