import { generateMeditation } from "../services/meditationGenerator";
import { createHandler } from "./createHandler";

export const handler = createHandler(generateMeditation);
