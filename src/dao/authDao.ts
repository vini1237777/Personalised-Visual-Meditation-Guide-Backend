import userModel from "../models/userModel";
import bcrypt from "bcrypt";

export class AuthDao {
  static async register({
    fullName,
    email,
    password,
  }: {
    fullName: string;
    email: string;
    password: string;
  }) {
    try {
      const existing = await userModel.findOne({
        email: email.toLowerCase().trim(),
      });
      if (existing) throw new Error("Email already in use");

      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      const newUser = new userModel({
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
      });

      const saved = await newUser.save();
      return {
        message: "User registered successfully",
        user: {
          id: saved._id.toString(),
          fullName: saved.fullName,
          email: saved.email,
          roles: saved.roles,
        },
      };
    } catch (err: any) {
      if (err?.code === 11000) throw new Error("Email already in use");
      throw err;
    }
  }

  static async login({ email, password }: { email: string; password: string }) {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await userModel
      .findOne({ email: normalizedEmail })
      .select("+password");

    if (!user) throw new Error("User not found");
    if (!user.password) throw new Error("Invalid credentials");

    const isMatch = await bcrypt.compare(password, user.password as string);
    if (!isMatch) throw new Error("Invalid credentials");

    const { password: _pw, ...obj } = user.toObject();

    return {
      id: obj._id.toString(),
      fullName: obj.fullName,
      email: obj.email,
      roles: obj.roles ?? [],
    };
  }
}
