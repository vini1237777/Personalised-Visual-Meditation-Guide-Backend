import { UserDao } from "../dao/userDao";
import { IUser } from "../types/interface";

export default class UserService {
  static async getByEmail(email: string) {
    return UserDao.getByEmail(email);
  }
  static async update(id: any, payload: any) {
    return UserDao.update(id, payload);
  }
}
