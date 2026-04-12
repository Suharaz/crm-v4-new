import {
  Controller,
  Post,
  Get,
  Delete,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Public } from '../auth/decorators/public-route.decorator';
import { McpAgentService } from './mcp-agent.service';
import { McpAgentAuthGuard } from './mcp-agent-auth.guard';

/**
 * MCP Streamable HTTP endpoint.
 * @Public() skips global JWT guard — uses API key auth instead.
 * Stateless mode: only POST is active, GET/DELETE return 405.
 */
@Controller('mcp')
@Public()
@UseGuards(McpAgentAuthGuard)
@SkipThrottle()
export class McpAgentController {
  constructor(private readonly mcpService: McpAgentService) {}

  @Post()
  async handlePost(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.mcpService.handlePost(req, res);
  }

  @Get()
  handleGet(@Res() res: Response): void {
    this.mcpService.handleMethodNotAllowed(res);
  }

  @Delete()
  handleDelete(@Res() res: Response): void {
    this.mcpService.handleMethodNotAllowed(res);
  }
}
