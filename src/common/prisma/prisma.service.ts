import * as dotenv from 'dotenv';
dotenv.config();
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { resolvePoolConfig } from './pool-config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;
  private readonly logger = new Logger(PrismaService.name);
  private readonly poolConfig: ReturnType<typeof resolvePoolConfig>;

  constructor(configService: ConfigService) {
    const connectionString = configService.get<string>('DATABASE_URL');
    const poolConfig = resolvePoolConfig(
      (key) => configService.get<string>(key) ?? process.env[key],
    );

    const pool = new Pool({
      connectionString,
      /*
        Bu to'rt sozlama ilgari berilmagan edi va `pg` o'z standartlariga
        tushardi: har bir process 10 tagacha ulanish ochardi va ulanish
        kutish vaqti cheksiz edi. Bitta instansiyada bu sezilmaydi, lekin
        cluster/replica qo'shilishi bilan ulanishlar soni process soniga
        ko'payadi va Postgres `max_connections` (standart 100) ga uriladi -
        o'shanda yangi ulanishlar "too many clients" bilan yiqiladi.
      */
      max: poolConfig.max,
      idleTimeoutMillis: poolConfig.idleTimeoutMillis,
      /*
        0 (standart) - pool to'lganda so'rov cheksiz kutadi va tashqaridan
        bu "API qotib qoldi" bo'lib ko'rinadi. Chegara qo'yilsa so'rov tez
        yiqiladi va sabab log'da aniq turadi.
      */
      connectionTimeoutMillis: poolConfig.connectionTimeoutMillis,
      /*
        Uzoq yashagan ulanishlarni davriy almashtiramiz - pgbouncer yoki
        DB restart'idan keyin qolib ketgan "o'lik" ulanishlarga qarshi.
      */
      maxLifetimeSeconds: poolConfig.maxLifetimeSeconds,
    });

    const adapter = new PrismaPg(pool);

    super({ adapter });
    this.pool = pool;
    this.poolConfig = poolConfig;

    /*
      Pool xatolari (masalan DB qayta ishga tushganda bo'sh turgan ulanish
      uzilishi) hech kim ushlamasa Node process'ni butunlay yiqitadi.
    */
    this.pool.on('error', (error) => {
      this.logger.error(`Pool ulanishida xato: ${error.message}`, error.stack);
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log(
      `Prisma ulandi (pool max=${this.poolConfig.max}, manba: ${this.poolConfig.source})`,
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
    this.logger.log('Prisma ulanishi yopildi');
  }

  /**
   * Pool holati - yuk testi paytida to'yinganlikni ko'rish uchun.
   * `waiting > 0` degani: so'rovlar bo'sh ulanish kutmoqda, ya'ni `max`
   * yetmayapti yoki so'rovlar juda sekin.
   */
  getPoolStats() {
    return {
      max: this.poolConfig.max,
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }
}
