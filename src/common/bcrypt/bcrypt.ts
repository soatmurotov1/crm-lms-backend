import * as bcrypt from 'bcrypt';

export async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

export async function comparePassword(oldPass, pass) {
  return await bcrypt.compare(oldPass, pass)
}
