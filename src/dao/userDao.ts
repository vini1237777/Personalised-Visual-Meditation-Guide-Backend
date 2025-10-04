import userModel from "../models/userModel";

export class UserDao {
  static async getByEmail(email: string) {
    return userModel.findOne({ email });
  }

  static async getAll() {
    return userModel.find({});
  }

  static async update(email: string, payload: any) {
    return userModel.findOneAndUpdate({ email }, payload, {
      new: true,
    });
  }
}
