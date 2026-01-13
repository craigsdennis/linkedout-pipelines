import { getUser as getUserFromDB, createUser as createUserInDB } from "./db";
/**
 * Get user from D1 database by email
 */
export async function getUser(email) {
    return await getUserFromDB(email);
}
/**
 * Create a new user in D1 database
 */
export async function createUser(email, isAdmin) {
    return await createUserInDB(email, isAdmin);
}
