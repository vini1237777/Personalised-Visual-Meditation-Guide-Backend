import userModel from "../models/userModel";

export class UserDao {
  static async getByEmail(email: string) {
    return userModel.findOne({ email });
  }

  static async getAll() {
    return userModel.find({});
  }

  static async update(id: any, payload: any) {
    return userModel.findByIdAndUpdate({ _id: id }, payload, {
      new: true,
    });
  }
}
