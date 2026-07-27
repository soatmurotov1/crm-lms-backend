import { Request } from 'express';

export function getClientIp(request: Request): string {
  return (
    (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    (request.headers['x-real-ip'] as string) ||
    request.socket.remoteAddress ||
    'Unknown'
  );
}
