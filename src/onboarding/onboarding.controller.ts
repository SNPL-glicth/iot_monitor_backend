import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { OnboardingService } from './onboarding.service';
import { CreateSensorDto } from './dto/create-sensor.dto';
import { ProvisioningResponse } from './interfaces/provisioning-response.interface';

@Controller('api/v1/onboarding')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('sensor')
  @HttpCode(HttpStatus.CREATED)
  async provisionSensor(
    @Body() dto: CreateSensorDto,
  ): Promise<ProvisioningResponse> {
    return this.onboardingService.provisionSensor(dto);
  }
}
