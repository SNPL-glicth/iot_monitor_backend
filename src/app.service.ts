import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return ':)';//lo qeue devuelve en el 3000 se supone 
  }
}
