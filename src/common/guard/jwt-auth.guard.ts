import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private jwtService: JwtService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        try {
            const req = context.switchToHttp().getRequest()

            const token = req.headers.authorization.split(" ")[1]

            if (!token) {
                throw new UnauthorizedException()
            }
            const user = await this.jwtService.verify(token)
            req.user = user
            return true
        } catch (error) {
            throw new UnauthorizedException()
        }
    }
}