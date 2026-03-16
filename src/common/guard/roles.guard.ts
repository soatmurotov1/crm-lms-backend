import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

@Injectable()
export class RolesGuard implements CanActivate{
    constructor(private reflector : Reflector){}
    canActivate(context: ExecutionContext): boolean {
        const {user} = context.switchToHttp().getRequest()
        const roles = this.reflector.get("roles",context.getHandler())

        if(!roles.includes(user.role)){
            throw new ForbiddenException()
        }
        return true
    }
}