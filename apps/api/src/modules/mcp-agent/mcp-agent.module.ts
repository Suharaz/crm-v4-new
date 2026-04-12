import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { McpAgentController } from './mcp-agent.controller';
import { McpAgentService } from './mcp-agent.service';
import { McpAgentAuthGuard } from './mcp-agent-auth.guard';

@Module({
  controllers: [McpAgentController],
  providers: [McpAgentService, McpAgentAuthGuard, PrismaClient],
})
export class McpAgentModule {}
