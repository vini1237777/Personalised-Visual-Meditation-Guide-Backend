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
| Hosting | AWS EC2, Nginx, PM2 |
| CI/CD | GitHub Actions |

## How a session is generated

```
POST /api/script/post with feelings and emojis
  -> gpt-4o-mini writes a short script
  -> Veo 3.1 starts generating, and the server polls until it is done
  -> the script and a video link go back to the client and onto the user record
GET /api/script/video/:fileId
  -> streams the file from Google, with the API key kept on the server
```

The request stays open while Veo works, and generation is limited to 6 minutes. The public demo currently plays saved clips instead of generating live.

## API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | None | Create an account |
| POST | `/api/auth/login` | None | Log in and receive a JWT |
| GET | `/api/user/get` | JWT | Read the signed in user |
| PUT | `/api/user/update/:id` | JWT and role | Update a user |
| POST | `/api/script/post` | None | Generate a script and video |
| GET | `/api/script/video/:fileId` | None | Stream a generated video |

## Security

- JWT access tokens with an expiry
- Role check on user updates
- bcrypt password hashing
- CORS limited to the site and local development
- Zod validation on sign up and log in

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
```

## Deployment

A push to `main` runs GitHub Actions, which connects to EC2 over SSH, writes the environment file, builds the code and restarts it with PM2. Nginx sits in front as the reverse proxy.
