import express from "express";
import UserService from "../services/UserService";

export default class userController {
  static async get(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) {
    try {
      const email = req.body.email;
      const events = await UserService.getByEmail(email);

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
      const payload = req.body;
      const id = req.params.id;
      if (req.user.sub === req.params.id || req.user.roles?.includes("admin")) {
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
