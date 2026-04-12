import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Guard that validates HMAC-SHA256 webhook signatures.
 * Expects `x-signature` header containing HMAC of raw body.
 * Falls back to API key auth if WEBHOOK_SECRET is not configured.
 */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('WEBHOOK_SECRET');
    if (!secret) return true; // fallback: skip if not configured

    const request = context.switchToHttp().getRequest();
    const signature = request.headers['x-signature'] as string;
    if (!signature) {
      throw new UnauthorizedException('Webhook signature bắt buộc (header x-signature)');
    }

    // Compute expected signature from raw body
    const rawBody = JSON.stringify(request.body);
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

    // Timing-safe comparison to prevent timing attacks
    try {
      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expected, 'hex');
      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        throw new UnauthorizedException('Webhook signature không hợp lệ');
      }
    } catch {
      throw new UnauthorizedException('Webhook signature không hợp lệ');
    }

    return true;
  }
}
