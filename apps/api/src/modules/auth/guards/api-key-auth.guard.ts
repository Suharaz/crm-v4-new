import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { API_KEY_AUTH } from '../decorators/api-key-auth.decorator';

/** Guard that validates x-api-key header against hashed keys in DB. */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Only activate on endpoints decorated with @ApiKeyAuth()
    const requiresApiKey = this.reflector.getAllAndOverride<boolean>(API_KEY_AUTH, [
      context.getHandler(), context.getClass(),
    ]);
    if (!requiresApiKey) return true;

    const request = context.switchToHttp().getRequest();
    const rawKey = request.headers['x-api-key'];

    if (!rawKey) {
      throw new UnauthorizedException('API key bắt buộc (header x-api-key)');
    }

    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { keyHash, isActive: true },
    });

    if (!apiKey) {
      throw new UnauthorizedException('API key không hợp lệ hoặc đã bị vô hiệu');
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new UnauthorizedException('API key đã hết hạn');
    }

    // Update lastUsedAt (fire-and-forget)
    this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {});

    return true;
  }
}
