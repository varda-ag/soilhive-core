import express, { Request, Response } from "express";

const app = express();
const port = 4001;

app.get("/", (req: Request, res: Response) => {
  res.send("Hello world from Express!");
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
