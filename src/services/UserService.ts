import { UserDao } from "../dao/userDao";
import { IUser } from "../types/interface";

export default class UserService {
  static async getByEmail(email: string) {
    return UserDao.getByEmail(email);
  }
  static async getById(id: string) {
    return UserDao.getById(id);
  }
  static async update(id: string, payload: Record<string, unknown>) {
    return UserDao.updateById(id, payload);
  }
}
