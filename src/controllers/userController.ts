import express from "express";
import UserService from "../services/UserService";
import { updateUserSchema } from "../validators/authValidator";

export default class userController {
  static async get(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) {
    try {
      // The token decides who this is, never the request.
      const events = await UserService.getById(String(req.user?.sub));

      return res.status(200).send({ events });
    } catch (err) {
      next(err);
    }
  }
  static async update(
    req: any,
    res: express.Response,
    next: express.NextFunction,
  ) {
    try {
      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid update" });
      }
      const payload = parsed.data;
      const id = req.params.id;

      const isAdmin = req.user.roles?.includes("admin");
      const isOwner = req.user.sub === req.params.id;

      if (isOwner || isAdmin) {
        const event = await UserService.update(id, payload);
        return res.status(200).send({ event });
      } else {
        return res.status(403).json({ error: "Forbidden" });
      }
    } catch (err) {
      next(err);
    }
  }
}
