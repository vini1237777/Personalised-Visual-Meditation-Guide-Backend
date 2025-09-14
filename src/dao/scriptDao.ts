import userModel from "../models/userModel";

export class scriptDao {
  static async getScript({ email }: { email: string[] }) {
    const user = userModel.findOne({ email });
    return user;
  }
}
