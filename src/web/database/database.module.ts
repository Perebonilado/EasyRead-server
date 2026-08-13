import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { ALL_MODELS } from './models';

/**
 * One Sequelize connection, shared by the API and the worker.
 *
 * `synchronize` is off everywhere — the schema is owned by the umzug
 * migrations in `/migrations`, and letting Sequelize alter tables at boot is
 * how staging and production quietly diverge.
 */
@Global()
@Module({
  imports: [
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        dialect: 'mysql' as const,
        // One connection string, shared with the migration runner, so the app
        // and the migrations can never point at different databases.
        uri: config.getOrThrow<string>('DATABASE_URL'),
        models: ALL_MODELS,
        autoLoadModels: false,
        synchronize: false,
        logging: false,
        define: { underscored: true },
        pool: {
          max: Number(config.get<string>('DB_POOL_MAX', '10')),
          idle: 10_000,
        },
      }),
    }),
    SequelizeModule.forFeature(ALL_MODELS),
  ],
  exports: [SequelizeModule],
})
export class DatabaseModule {}
