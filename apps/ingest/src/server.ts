import express, { Request, Response } from "express";
import cors from "cors";
import { config } from "./config";
import { runPopulate } from "./populateService";
import { errorHandler } from "./middleware/errorHandler";

const app = express();
app.use(cors());

app.post("/populate", async (_req: Request, res: Response) => {
  const result = await runPopulate();
  res.status(200).json(result);
});

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Ingest server running on port ${config.port}`);
});
