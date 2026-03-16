export function generateRandomPassword(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  
  const password = Array.from({ length }, () => 
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')

  return password;
}