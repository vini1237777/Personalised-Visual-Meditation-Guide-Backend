import { z } from "zod";

export const signupSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(100),
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(1).max(100).optional(),
  selectedFeelings: z.array(z.string().max(50)).max(20).optional(),
  selectedEmojis: z.array(z.string().max(50)).max(20).optional(),
});

export const generateSchema = z.object({
  selectedFeelings: z.array(z.string().trim().min(1).max(50)).min(1).max(20),
  selectedEmojis: z.array(z.string().max(50)).max(20).default([]),
});
