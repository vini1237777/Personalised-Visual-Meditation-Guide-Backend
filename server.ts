import "dotenv/config";
import app from "./src/app";

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0/0";

app.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});

// const server = app.listen(port, host, () => {
//   const addr = server.address();
//   console.log(
//     `Server listening on http://${(addr as any).address}:${(addr as any).port}`
//   );
// });
