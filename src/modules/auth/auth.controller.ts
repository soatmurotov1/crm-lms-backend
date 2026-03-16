import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService : AuthService){}

    @Post("login/admin")
    login(@Body() payload : LoginDto){
        return this.authService.login(payload)
    }

    @Post("login/teacher")
    loginTeacher(@Body() payload : LoginDto){
        return this.authService.loginTeacher(payload)
    }

    @Post("login/student")
    loginStudent(@Body() payload : LoginDto){
        return this.authService.loginStudent(payload)
    }

}
