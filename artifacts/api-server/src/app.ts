import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// خدمة ملفات React Frontend مع فحص مرن للمسارات في Render
const possiblePaths = [
  path.resolve(__dirname, "../dist"),
  path.resolve(__dirname, "../../omar-law-office/dist"),
  path.resolve(process.cwd(), "artifacts/omar-law-office/dist"),
  path.resolve(process.cwd(), "dist"),
];

const clientDistPath = possiblePaths.find((p) => fs.existsSync(p)) || possiblePaths[0];

app.use(express.static(clientDistPath));

app.get("*", (req, res) => {
  const indexPath = path.join(clientDistPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Frontend build not found at " + clientDistPath);
  }
});

export default app;