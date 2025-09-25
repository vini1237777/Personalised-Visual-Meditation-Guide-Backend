import { AuthDao } from "../dao/authDao";
import { IUser } from "../types/interface";

export default class AuthService {
  static async register({ fullName, email, password, id }: IUser) {
    return AuthDao.register({ fullName, email, password, id });
  }
  // static async login({ email, password }: { email: string; password: string }) {
  //   return AuthDao.login({ email, password });
  // }

  static async login({ email, password }: { email: string; password: string }) {
    return AuthDao.login({ email, password });
  }
}
