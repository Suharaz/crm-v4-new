import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

/**
 * Guard validates HMAC-SHA256 webhook signatures over RAW body bytes.
 *
 * Expects `x-signature` header containing hex HMAC. Requires NestFactory
 * created with `rawBody: true` so `req.rawBody` is populated.
 *
 * WEBHOOK_SECRET is optional - khi không config, guard skip signature check
 * và chỉ dựa vào API key (ApiKeyAuthGuard) để verify caller. Khi tích hợp
 * bank API thực (VietQR/SePay/MB) require HMAC, set WEBHOOK_SECRET trong
 * env để bật signature verification mà không cần code change.
 */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('WEBHOOK_SECRET');
    // Optional: skip HMAC verification khi WEBHOOK_SECRET không set.
    // API key (ApiKeyAuthGuard) vẫn enforce - đủ cho internal trust model.
    if (!secret) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const signature = request.headers['x-signature'] as string | undefined;
    if (!signature) {
      throw new UnauthorizedException('Webhook signature bắt buộc (header x-signature)');
    }

    // HMAC over raw bytes - matches what sender signed before body-parser ran
    const rawBody = request.rawBody;
    if (!rawBody || rawBody.length === 0) {
      this.logger.error('rawBody missing - check NestFactory.create({ rawBody: true })');
      throw new UnauthorizedException('Webhook body không hợp lệ');
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

    // Timing-safe comparison to prevent timing attacks
    try {
      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expected, 'hex');
      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        throw new UnauthorizedException('Webhook signature không hợp lệ');
      }
    } catch (err) {
      // Buffer.from with invalid hex throws - treat as invalid signature
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Webhook signature không hợp lệ');
    }

    return true;
  }
}
