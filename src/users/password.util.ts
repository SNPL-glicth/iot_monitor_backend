import * as bcrypt from 'bcryptjs';

// mas facil que argon
// usa bcryptjs para  evitar probloemas directamente con javascript por binarios
export class PasswordUtil {
  // numero de rondas de hash para pruebas / desarrollo
  private static readonly ROUNDS = 10;

  static async hashPassword(plain: string): Promise<string> {
    const salt = await bcrypt.genSalt(PasswordUtil.ROUNDS);
    return bcrypt.hash(plain, salt);
  }

  static async comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
