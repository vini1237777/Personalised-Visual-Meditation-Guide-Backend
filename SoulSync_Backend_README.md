# SoulSync — AI-Enabled Meditation Platform (Backend)

REST API backend for SoulSync — a personalized AI-enabled meditation platform. Handles authentication, user management, meditation session generation via Gemini AI, and media delivery.

**Live:** [meditateaurelia.fit](https://www.meditateaurelia.fit)  
**Frontend repo:** [Personalised-Visual-Meditation-Guide-Frontend](https://github.com/vini1237777/Personalised-Visual-Meditation-Guide-Frontend)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js, Express.js, TypeScript |
| Database | MongoDB (Mongoose) |
| AI | LangChain, Google Gemini APIs |
| Auth | JWT, bcrypt, RBAC |
| Media | AWS S3, CloudFront CDN |
| Hosting | AWS EC2, Nginx, PM2 |
| CI/CD | GitHub Actions |

---

## API Overview

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/login` | Login (returns JWT) |

### Meditation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/meditation/generate` | Generate AI meditation session |
| GET | `/api/meditation/sessions` | Get user's session history |

### Media
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/media/*` | Serve media via S3 + CloudFront |

---

## Security

- **JWT authentication** with token expiry and refresh
- **Role-Based Access Control (RBAC)** for user/admin routes
- **bcrypt** password hashing (salt rounds: 12)
- **Domain-restricted CORS** — only allows requests from the frontend domain
- **Request validation** on all endpoints

---

## Architecture

```
Client Request
     │
     ▼
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Nginx   │────▶│ Express  │────▶│ MongoDB  │
│ (proxy)  │     │  (PM2)   │     │          │
└──────────┘     └────┬─────┘     └──────────┘
                      │
               ┌──────▼──────┐
               │ Gemini API  │
               │ (LangChain) │
               └─────────────┘

Media Pipeline:
Upload → S3 Bucket → CloudFront CDN → Client
(load time: ~5s → < 1s)
```

---

## Local Setup

```bash
git clone https://github.com/vini1237777/Personalised-Visual-Meditation-Guide-Backend.git
cd Personalised-Visual-Meditation-Guide-Backend
npm install
```

Create a `.env` file:
```
PORT=5000
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
GEMINI_API_KEY=your_gemini_key
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_S3_BUCKET=your_bucket_name
CLOUDFRONT_URL=your_cloudfront_url
CORS_ORIGIN=http://localhost:5173
```

```bash
npm run dev
```

---

## Deployment

Running on **AWS EC2** with:
- **Nginx** as reverse proxy
- **PM2** for process management and zero-downtime restarts
- **GitHub Actions** CI/CD pipeline — auto-deploys on push to `main`

---

## Related

- [SoulSync Frontend](https://github.com/vini1237777/Personalised-Visual-Meditation-Guide-Frontend)
