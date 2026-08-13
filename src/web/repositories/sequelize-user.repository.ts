import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from '../../business/domain/entities/user';
import type {
  CreateUserInput,
  UserRepository,
} from '../../business/repositories/user.repository';
import { UserModel } from '../database/models';
import { newId } from '../database/uuid';
import { toUser } from './mappers';

@Injectable()
export class SequelizeUserRepository implements UserRepository {
  constructor(
    @InjectModel(UserModel) private readonly model: typeof UserModel,
  ) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.model.findByPk(id);
    return row ? toUser(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.model.findOne({ where: { email } });
    return row ? toUser(row) : null;
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    const row = await this.model.findOne({ where: { googleId } });
    return row ? toUser(row) : null;
  }

  async findByVerificationTokenHash(hash: string): Promise<User | null> {
    const row = await this.model.findOne({
      where: { verificationTokenHash: hash },
    });
    return row ? toUser(row) : null;
  }

  async findByResetTokenHash(hash: string): Promise<User | null> {
    const row = await this.model.findOne({ where: { resetTokenHash: hash } });
    return row ? toUser(row) : null;
  }

  async emailExists(email: string): Promise<boolean> {
    return (await this.model.count({ where: { email } })) > 0;
  }

  async create(input: CreateUserInput): Promise<User> {
    const row = await this.model.create({ id: newId(), ...input } as any);
    return toUser(row);
  }

  async save(user: User): Promise<void> {
    const p = user.props;
    await this.model.update(
      {
        email: p.email,
        passwordHash: p.passwordHash,
        googleId: p.googleId,
        name: p.name,
        emailVerifiedAt: p.emailVerifiedAt,
        defaultLevel: p.defaultLevel,
        verificationTokenHash: p.verificationTokenHash,
        verificationTokenExpires: p.verificationTokenExpires,
        resetTokenHash: p.resetTokenHash,
        resetTokenExpires: p.resetTokenExpires,
        tokenVersion: p.tokenVersion,
        deletedAt: p.deletedAt,
      },
      { where: { id: p.id } },
    );
  }
}
