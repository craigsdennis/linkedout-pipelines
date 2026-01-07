import { env } from "cloudflare:workers";
import type { User } from "../types";
import { getUser as getUserFromDB, createUser as createUserInDB } from "./db";

/**
 * Get user from D1 database by email
 */
export async function getUser(email: string): Promise<User | null> {
  return await getUserFromDB(email);
}

/**
 * Create a new user in D1 database
 */
export async function createUser(
  email: string,
  isAdmin: boolean
): Promise<User> {
  return await createUserInDB(email, isAdmin);
}
