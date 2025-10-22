import express, { Request, Response } from "express";

const app = express();
const port = 3000;

app.get("/", (req: Request, res: Response) => {
  res.send("Hello world from Express!");
});

app.get("/modules.json", (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const modules = [
    {
      name: 'comparavailability',
      entry: 'http://localhost:3002/mf-manifest.json'
    }
  ];
  res.json(modules);
})

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});