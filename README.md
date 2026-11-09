# SoulSync Backend

Express API for SoulSync, a meditation app that turns how you feel into a short video. It handles accounts, writes a meditation script from your selected moods, and generates the video with Veo through the Gemini API.

**Live:** [meditateaurelia.fit](https://www.meditateaurelia.fit)
**Frontend repo:** [Personalised-Visual-Meditation-Guide-Frontend](https://github.com/vini1237777/Personalised-Visual-Meditation-Guide-Frontend)

## Tech stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js, Express 5, TypeScript |
| Database | MongoDB with Mongoose |
| Script | OpenAI `gpt-4o-mini` through LangChain |
| Video | Veo 3.1 through the Gemini API (`@google/genai`) |
| Auth | JWT, bcrypt, role checks |
| Search | MongoDB Atlas Vector Search, Gemini embeddings |
| Storage | Private S3 bucket, presigned links |
| Jobs | SQS, Lambda, dead letter queue (SAM) |
| Hosting | AWS EC2, Nginx, PM2 |
| CI/CD | GitHub Actions |

## How a session is generated

```
POST /api/script/post with feelings and emojis
  -> saves a job, queues it on SQS and answers 202 with a job id
Lambda worker
  -> claims the job atomically, so a repeat delivery does nothing
  -> gpt-4o-mini writes a short script
  -> Veo 3.1 generates the video, limited to 6 minutes
  -> the video streams from Google into a private S3 bucket
  -> if generation fails, the job offers the user's closest saved session
GET /api/script/jobs/:jobId
  -> the client polls this, and gets a link that lasts 1 hour when the job is done
```

Without `SQS_QUEUE_URL` the job runs inside the API process. Without `S3_VIDEO_BUCKET` the video streams from Google through `/api/script/video/:fileId`, with the key kept on the server. The public demo currently plays saved clips instead of generating live.

## API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | None | Create an account |
| POST | `/api/auth/login` | None | Log in and receive a JWT |
| GET | `/api/user/get` | JWT | Read the signed in user |
| PUT | `/api/user/update/:id` | JWT and role | Update a user |
| POST | `/api/script/post` | JWT | Start a generation job |
| GET | `/api/script/jobs/:jobId` | JWT, owner only | Check a job |
| GET | `/api/script/video-link` | JWT | New link to your saved video |
| POST | `/api/script/similar` | JWT | Your closest saved sessions |
| GET | `/api/script/video/:fileId` | None | Stream a generated video (fallback) |

## Security

- JWT access tokens with an expiry
- Role check on user updates
- bcrypt password hashing
- CORS limited to the site and local development
- Zod validation on sign up and log in

## Benchmarks & Architecture Verification

Each row links to the code and to what checks it. Run the tests with `npm test`.

| Claim | Code | Evidence |
|---|---|---|
| Node streams from Google to client and to S3 | [geminiVideo.ts](src/lib/geminiVideo.ts), [videoStorage.ts](src/lib/videoStorage.ts) | [streaming tests](test/geminiVideo.test.ts), [upload tests](test/videoStorage.test.ts) |
| S3 private storage with presigned links | [videoStorage.ts](src/lib/videoStorage.ts) | [upload tests](test/videoStorage.test.ts) |
| SQS and Lambda async generation | [template.yaml](template.yaml), [createHandler.ts](src/lambda/createHandler.ts), [jobRunner.ts](src/services/jobRunner.ts) | [job tests](test/jobs.test.ts) |
| Atlas Vector Search | [sessionMemory.ts](src/services/sessionMemory.ts), [index definition](atlas/meditation-session-vector-index.json) | [pipeline tests](test/sessionMemory.test.ts) |
| JWT auth on generation | [authMiddleware.ts](src/middleware/authMiddleware.ts) | [auth tests](test/auth.test.ts) |
| GitHub Actions deploy to EC2 | [deploy-backend.yml](.github/workflows/deploy-backend.yml) | Workflow runs on this repo |

The tests use a local MongoDB and local stand ins for S3, SQS and Gemini. The SAM template has not been deployed, and the vector search pipeline has not run on Atlas, because `$vectorSearch` does not exist on local MongoDB.

## Local setup

```bash
npm install
npm run dev
npm test
```

Create a `.env` file:

```
PORT=3000
MONGODB_URI=your_mongodb_uri
JWT_ACCESS_SECRET=your_jwt_secret
ACCESS_EXPIRES_IN=1h
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key
PUBLIC_API_URL=http://localhost:3000

# Optional. Each one turns on a feature, and the app runs without them.
S3_VIDEO_BUCKET=
AWS_REGION=ap-south-1
SQS_QUEUE_URL=
VECTOR_SEARCH=off
```

## Deployment

A push to `main` runs GitHub Actions, which connects to EC2 over SSH, writes the environment file, builds the code and restarts it with PM2. Nginx sits in front as the reverse proxy.
