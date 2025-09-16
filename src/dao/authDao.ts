import userModel from "../models/userModel";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export class AuthDao {
  static async register({
    fullName,
    email,
    password,
    id,
  }: {
    fullName: string;
    email: string;
    password: string;
    id?: string;
  }) {
    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = new userModel({
        fullName,
        email,
        password: hashedPassword,
      });
      await newUser.save();
      return {
        message: "User registered successfully",
        data: { fullName, email, id },
      };
    } catch (error: any) {
      throw new Error(error);
    }
  }

  static async login({ email, password }: { email: string; password: string }) {
    try {
      console.log(email, "Auth dao login.......");

      const user: any = await userModel.findOne({ email });

      // console.log(password, user.password, "passwords");

      // console.log(user, "user in login controller");

      if (!user) throw new Error("User not found");
      console.log(password, user.password, "login controller");
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) throw new Error("Invalid credentials");

      const jwtSecret = process.env.JWT_ACCESS_SECRET;
      if (!jwtSecret || typeof jwtSecret !== "string") {
        throw new Error("JWT secret key is not defined");
      }
      // console.log("JWT secret key is defined");
      // console.log("User found and password matched");
      // Generate JWT token
      const token = jwt.sign({ userId: user?.id }, jwtSecret, {
        expiresIn: "1h",
      });

      return {
        message: "User loggedin successfully",
        token,
        user,
      };
    } catch (error: any) {
      console.error("Error in login:", error);
      if (
        error.message === "User not found" ||
        error.message === "Invalid credentials"
      ) {
        throw new Error(error.message);
      }
      throw new Error("Server error");
    }
  }
}
