import userModel from "../models/userModel";

export class UserDao {
  static async getByEmail(email: string) {
    return userModel.findOne({ email });
  }

  static async getById(id: string) {
    return userModel.findById(id);
  }

  static async updateById(id: string, payload: Record<string, unknown>) {
    return userModel.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    });
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
