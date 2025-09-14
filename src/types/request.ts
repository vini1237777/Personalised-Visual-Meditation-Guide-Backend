import express from "express";

export type Req = express.Request & { user: { id: string } };
