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

// تحديد مسار ملفات الـ React Frontend
const candidatePaths = [
  path.resolve(__dirname, "../../omar-law-office/dist"),
  path.resolve(process.cwd(), "artifacts/omar-law-office/dist"),
  path.resolve(__dirname, "../dist"),
  path.resolve(process.cwd(), "dist"),
];

let clientDistPath = candidatePaths[0];
for (const p of candidatePaths) {
  if (fs.existsSync(p)) {
    clientDistPath = p;
    break;
  }
}

app.use(express.static(clientDistPath));

app.get("*", (req, res) => {
  const indexPath = path.join(clientDistPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Frontend build files not found.");
  }
});

export default app;