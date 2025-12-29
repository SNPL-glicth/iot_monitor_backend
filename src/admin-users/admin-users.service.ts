import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PasswordUtil } from '../users/password.util';//para evodemcia ovbia necesita una utilizad de contraseñ 

@Injectable()//clase de servicios de usuario
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  findAll(): Promise<User[]> {
    return this.userRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: number): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: String(id) } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async create(dto: CreateUserDto): Promise<User> {
    const now = new Date();

    const passwordHash = await PasswordUtil.hashPassword(dto.password);

    const user = this.userRepo.create({
      username: dto.username,
      email: dto.email,
      passwordHash,
      role: dto.role,
      isActive: dto.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.userRepo.save(user);
    this.logger.log(
      `AdminUsers.create userId=${saved.id} username=${saved.username} role=${saved.role} active=${saved.isActive}`,
    );
    return saved;
  }

  async update(id: number, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    const passwordChanged = !!dto.password;

    if (dto.username !== undefined) user.username = dto.username;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;

    if (dto.password) {
      user.passwordHash = await PasswordUtil.hashPassword(dto.password);
    }

    user.updatedAt = new Date();

    const saved = await this.userRepo.save(user);
    this.logger.log(
      `AdminUsers.update userId=${saved.id} username=${saved.username} role=${saved.role} active=${saved.isActive} passwordChanged=${passwordChanged}`,
    );
    return saved;
  }

  async remove(id: number): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepo.remove(user);
    this.logger.warn(`AdminUsers.remove userId=${user.id} username=${user.username}`);
  }
}
