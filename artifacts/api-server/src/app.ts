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

// مسارات الـ API
app.use("/api", router);

// تحديد كافة المسارات المحتملة لمجلد الفرونت إند
const possiblePaths = [
  path.resolve(process.cwd(), "artifacts/omar-law-office/dist"),
  path.resolve(__dirname, "../../omar-law-office/dist"),
  path.resolve(__dirname, "../dist"),
  path.resolve(process.cwd(), "dist"),
];

// البحث عن أول مسار موجود بالفعل
let clientDistPath = possiblePaths.find((p) => fs.existsSync(p)) || possiblePaths[0];

console.log("Serving static frontend files from:", clientDistPath);

app.use(express.static(clientDistPath));

app.get("*", (_req, res) => {
  const indexPath = path.join(clientDistPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send(`
      <h2>Server is running successfully!</h2>
      <p>Frontend dist directory was not found at: <code>${clientDistPath}</code></p>
      <p>Please check your build scripts.</p>
    `);
  }
});

export default app;