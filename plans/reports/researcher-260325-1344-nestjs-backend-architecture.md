# NestJS CRM Backend Architecture Research Report

**Date:** 2026-03-25
**Focus:** NestJS backend architecture patterns for internal CRM (50-200 users)
**Stack:** NestJS 10+, Prisma, PostgreSQL, Turborepo, TypeScript, JWT, REST API

---

## Executive Summary

This report synthesizes industry best practices for NestJS CRM backends. Key patterns covered: module organization, layered architecture with Prisma, JWT + refresh token rotation, RBAC with guards/decorators, REST API design, and business logic patterns for lead/customer management. Emphasis on production-ready patterns for small-to-medium team CRM with scale to 200 users.

---

## 1. NestJS Module Structure & Organization

### 1.1 CRM Module Decomposition

**Recommended module split for CRM:**

```
src/
├── auth/                    # Authentication & JWT
├── users/                   # User management, roles
├── leads/                   # Lead CRUD, assignment, scoring
├── customers/               # Customer profiles, conversion tracking
├── orders/                  # Order management, fulfillment
├── activities/              # Call logs, emails, interactions
├── analytics/               # Reports, dashboards, metrics
├── integrations/            # 3rd party APIs (webhooks, sync)
├── csv-import/              # Bulk import, file processing
├── shared/                  # Decorators, filters, interceptors
├── common/                  # Types, constants, utils
└── app.module.ts
```

**Module Purpose:**
- `auth`: JWT strategy, refresh tokens, password reset
- `users`: RBAC hierarchy, team management, permissions
- `leads`: Lead records, assignment logic, AI scoring
- `customers`: Customer profiles, lifetime value, KPIs
- `orders`: Order creation, fulfillment, revenue tracking
- `activities`: Call logs, email history, interaction timeline
- `analytics`: Reports, dashboards, lead funnel metrics
- `integrations`: Webhooks from CallCenter, CRM sync APIs
- `csv-import`: CSV parsing, validation, queued processing (Bull)
- `shared`: Global guards, decorators, exception filters
- `common`: Enums, constants, utility functions

### 1.2 Module Internal Structure

**Pattern for each feature module:**

```
src/leads/
├── dto/
│   ├── create-lead.dto.ts
│   ├── update-lead.dto.ts
│   ├── filter-lead.dto.ts
│   ├── lead-response.dto.ts
│   └── lead.pagination-query.dto.ts
├── entities/                    # Prisma schema mirrors here (types only)
│   └── lead.entity.ts
├── guards/
│   ├── lead-ownership.guard.ts  # Can user access this lead?
│   └── lead-assignment.guard.ts
├── services/
│   ├── lead.service.ts          # Business logic
│   ├── lead-assignment.service.ts
│   ├── lead-scoring.service.ts
│   └── lead-repository.service.ts # Prisma queries
├── controllers/
│   └── lead.controller.ts
├── interceptors/
│   └── lead-response.interceptor.ts
├── decorators/
│   └── owner-or-manager.decorator.ts
├── leads.module.ts
└── constants/
    └── lead.constants.ts
```

**Key principle:** Repository service handles ALL Prisma queries, business service calls it.

---

## 2. Layered Architecture with Prisma

### 2.1 Architecture Layers

```
Controller (HTTP handling)
    ↓ (DTO validation)
Service (Business logic, orchestration)
    ↓
Repository (Data access)
    ↓
Prisma Client (Database driver)
```

### 2.2 Repository Service Pattern

**Example: Lead Repository Service**

```typescript
// src/leads/services/lead-repository.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class LeadRepositoryService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.LeadCreateInput) {
    return this.prisma.lead.create({
      data,
      include: { owner: true, activities: true },
    });
  }

  async findById(id: string, userId: string) {
    // Implicit authorization: filter by accessible leads
    return this.prisma.lead.findFirst({
      where: { id, team_id: (await this.getTeamId(userId)) },
      include: { owner: true, activities: true },
    });
  }

  async findMany(
    filter: Prisma.LeadFindManyArgs,
    pagination: { skip: number; take: number },
  ) {
    return Promise.all([
      this.prisma.lead.findMany({
        ...filter,
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.lead.count({ where: filter.where }),
    ]);
  }

  async update(id: string, data: Prisma.LeadUpdateInput) {
    return this.prisma.lead.update({
      where: { id },
      data,
      include: { owner: true },
    });
  }

  async delete(id: string) {
    return this.prisma.lead.delete({ where: { id } });
  }

  private async getTeamId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { team_id: true },
    });
    return user.team_id;
  }
}
```

### 2.3 Business Service Pattern

```typescript
// src/leads/services/lead.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadRepositoryService } from './lead-repository.service';
import { LeadScoringService } from './lead-scoring.service';
import { CreateLeadDto } from '../dto/create-lead.dto';

@Injectable()
export class LeadService {
  constructor(
    private repo: LeadRepositoryService,
    private scoring: LeadScoringService,
  ) {}

  async createLead(dto: CreateLeadDto, userId: string) {
    // Calculate score before insertion
    const score = await this.scoring.calculateScore(dto);

    // Determine assignment (manual or AI)
    const assignedTo = await this.determineAssignment(dto, score);

    const lead = await this.repo.create({
      name: dto.name,
      email: dto.email,
      score,
      owner_id: assignedTo,
      created_by: userId,
      team_id: await this.getUserTeamId(userId),
    });

    // Emit event: lead.created → triggers activity log, notifications
    this.eventEmitter.emit('lead.created', { lead, userId });

    return lead;
  }

  async convertLeadToCustomer(leadId: string, userId: string) {
    const lead = await this.repo.findById(leadId, userId);
    if (!lead) throw new NotFoundException('Lead not found');

    // Transactional: create customer + update lead status + log activity
    return await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          name: lead.name,
          email: lead.email,
          source_lead_id: leadId,
          team_id: lead.team_id,
        },
      });

      await tx.lead.update({
        where: { id: leadId },
        data: { status: 'converted', converted_at: new Date() },
      });

      this.eventEmitter.emit('lead.converted', { leadId, customerId: customer.id, userId });
      return customer;
    });
  }

  private async determineAssignment(dto: CreateLeadDto, score: number): Promise<string> {
    // Logic: if score > threshold, use AI assignment; else manual
    if (score >= 75) {
      return await this.scoring.assignByWeightedScore(dto);
    }
    return dto.assignedTo; // Manual assignment
  }
}
```

---

## 3. Turborepo Monorepo Structure

### 3.1 Folder Layout

```
crm-v3/ (root)
├── apps/
│   ├── api/                     # NestJS backend
│   │   ├── src/
│   │   ├── nest-cli.json
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── .env.example
│   │
│   └── web/                     # Next.js frontend
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── database/                # Prisma schema + migrations
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── types/                   # Shared DTOs, interfaces
│   │   ├── src/
│   │   │   ├── dto/
│   │   │   │   ├── lead.dto.ts
│   │   │   │   ├── user.dto.ts
│   │   │   │   └── order.dto.ts
│   │   │   ├── entities/
│   │   │   ├── enums/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── utils/                   # Shared utilities (validation, formatting)
│   │   ├── src/
│   │   │   ├── validators/
│   │   │   ├── formatters/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── eslint-config/           # Shared linting rules
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── .env.root
```

### 3.2 Package Dependencies

**apps/api/package.json (key deps):**

```json
{
  "dependencies": {
    "@nestjs/common": "^10.3.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/jwt": "^12.1.0",
    "@nestjs/passport": "^10.0.3",
    "@nestjs/typeorm": "^9.0.1",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "@prisma/client": "^5.9.0",
    "class-validator": "^0.14.0",
    "class-transformer": "^0.5.1",
    "bull": "^4.12.0",
    "pino": "^8.18.0",
    "pino-http": "^8.7.0",
    "@types/multer": "^1.4.11"
  },
  "devDependencies": {
    "@nestjs/testing": "^10.3.0",
    "@types/jest": "^29.5.11",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "prisma": "^5.9.0"
  }
}
```

**packages/database/package.json:**

```json
{
  "dependencies": {
    "@prisma/client": "^5.9.0"
  },
  "devDependencies": {
    "prisma": "^5.9.0"
  }
}
```

**packages/types/package.json:**

```json
{
  "dependencies": {
    "class-validator": "^0.14.0",
    "class-transformer": "^0.5.1"
  }
}
```

### 3.3 Shared Package Usage in API

```typescript
// apps/api/src/leads/dto/create-lead.dto.ts
import { CreateLeadDto } from '@crm/types';

export { CreateLeadDto };

// OR extend if API-specific validation needed
export class CreateLeadApiDto extends CreateLeadDto {
  @IsString()
  team_id: string;
}
```

---

## 4. JWT Authentication & Refresh Token Rotation

### 4.1 Auth Module Structure

```
src/auth/
├── guards/
│   ├── jwt.guard.ts
│   ├── jwt-refresh.guard.ts
│   └── optional-jwt.guard.ts      # For public endpoints
├── strategies/
│   ├── jwt.strategy.ts
│   ├── jwt-refresh.strategy.ts
│   └── local.strategy.ts           # For login (optional)
├── decorators/
│   └── current-user.decorator.ts
├── services/
│   ├── auth.service.ts
│   ├── token.service.ts            # JWT generation & validation
│   └── password.service.ts         # Hash & verify
├── controllers/
│   └── auth.controller.ts
└── auth.module.ts
```

### 4.2 JWT Strategy + Current User

```typescript
// src/auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      team_id: payload.team_id,
    };
  }
}

// src/auth/strategies/jwt-refresh.strategy.ts
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refresh_token'),
      secretOrKey: process.env.JWT_REFRESH_SECRET,
    });
  }

  async validate(payload: any) {
    return { userId: payload.sub, email: payload.email };
  }
}

// src/auth/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
```

### 4.3 Token Service (Access + Refresh)

```typescript
// src/auth/services/token.service.ts
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

interface TokenPayload {
  sub: string;           // user ID
  email: string;
  role: string;
  team_id: string;
}

@Injectable()
export class TokenService {
  constructor(private jwt: JwtService) {}

  /**
   * Generate access token (short-lived, 15 min)
   * Payload: user basics only
   */
  generateAccessToken(user: TokenPayload): string {
    return this.jwt.sign(
      {
        sub: user.sub,
        email: user.email,
        role: user.role,
        team_id: user.team_id,
      },
      {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m',
      },
    );
  }

  /**
   * Generate refresh token (long-lived, 7 days)
   * Payload: minimal, to reduce validation work
   */
  generateRefreshToken(userId: string, email: string): string {
    return this.jwt.sign(
      {
        sub: userId,
        email,
        type: 'refresh',
      },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      },
    );
  }

  /**
   * Rotate: validate refresh token, issue new access + refresh pair
   * NEW: Store refresh token hash in DB to prevent token replay
   */
  async rotateTokens(
    refreshToken: string,
    userId: string,
    repo: UserRepository,
  ): Promise<{ access_token: string; refresh_token: string }> {
    try {
      const payload = this.jwt.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      // Validate token family (prevent old tokens)
      const user = await repo.findById(userId);
      if (user.refresh_token_family !== payload.token_family) {
        throw new UnauthorizedException('Token family mismatch - possible token reuse');
      }

      // Generate new pair
      const newAccessToken = this.generateAccessToken({
        sub: userId,
        email: user.email,
        role: user.role,
        team_id: user.team_id,
      });

      const newRefreshToken = this.generateRefreshToken(userId, user.email);
      const newTokenFamily = this.generateTokenFamily(); // UUID

      // Store new family ID (rotation chain tracking)
      await repo.updateRefreshTokenFamily(userId, newTokenFamily);

      return {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private generateTokenFamily(): string {
    return `fam_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}
```

### 4.4 Auth Controller (Login + Refresh)

```typescript
// src/auth/controllers/auth.controller.ts
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { TokenService } from '../services/token.service';
import { JwtRefreshGuard } from '../guards/jwt-refresh.guard';
import { CurrentUser } from '../decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private token: TokenService,
  ) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    const user = await this.auth.validateUser(body.email, body.password);
    const access_token = this.token.generateAccessToken(user);
    const refresh_token = this.token.generateRefreshToken(user.id, user.email);

    return { access_token, refresh_token };
  }

  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  async refresh(@CurrentUser('id') userId: string) {
    return this.token.rotateTokens(userId);
  }

  @Post('logout')
  async logout(@CurrentUser('id') userId: string) {
    // Optional: blacklist token or clear refresh family
    await this.auth.invalidateRefreshTokens(userId);
    return { message: 'Logged out' };
  }
}
```

---

## 5. RBAC (Role-Based Access Control)

### 5.1 Role Hierarchy

```
SUPER_ADMIN (can manage users, roles, system settings)
  ├── MANAGER (can manage team members, leads, orders)
  │   └── USER (can view/edit own leads, call logs)
```

**Prisma schema:**
```prisma
model User {
  id String @id @default(cuid())
  email String @unique
  role Role @default(USER)
  team_id String
  team Team @relation(fields: [team_id], references: [id])
}

enum Role {
  SUPER_ADMIN
  MANAGER
  USER
}
```

### 5.2 Role Guard

```typescript
// src/auth/guards/role.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler());
    if (!requiredRoles) return true; // No roles required

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const roleHierarchy = { SUPER_ADMIN: 3, MANAGER: 2, USER: 1 };
    const userLevel = roleHierarchy[user.role] || 0;
    const requiredLevel = Math.max(...requiredRoles.map((r) => roleHierarchy[r]));

    if (userLevel < requiredLevel) {
      throw new ForbiddenException(`Requires role: ${requiredRoles.join(' or ')}`);
    }

    return true;
  }
}

// src/auth/decorators/require-role.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const RequireRole = (...roles: string[]) => SetMetadata('roles', roles);
```

### 5.3 Resource-Based Authorization Guard

```typescript
// src/leads/guards/lead-ownership.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { LeadRepositoryService } from '../services/lead-repository.service';

@Injectable()
export class LeadOwnershipGuard implements CanActivate {
  constructor(private repo: LeadRepositoryService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const leadId = request.params.id;

    const lead = await this.repo.findById(leadId, user.id);

    // Access granted if:
    // 1. User is owner
    // 2. User is manager + same team
    // 3. User is SUPER_ADMIN
    const isOwner = lead.owner_id === user.id;
    const isManager = user.role === 'MANAGER' && lead.team_id === user.team_id;
    const isSuperAdmin = user.role === 'SUPER_ADMIN';

    if (!isOwner && !isManager && !isSuperAdmin) {
      throw new ForbiddenException('Cannot access this lead');
    }

    request.lead = lead; // Attach for use in controller
    return true;
  }
}
```

### 5.4 Controller Usage

```typescript
// src/leads/controllers/lead.controller.ts
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guards/jwt.guard';
import { LeadOwnershipGuard } from '../guards/lead-ownership.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@Controller('leads')
@UseGuards(JwtGuard)
export class LeadController {
  constructor(private leads: LeadService) {}

  @Get(':id')
  @UseGuards(LeadOwnershipGuard)
  async getLead(@Param('id') leadId: string, @CurrentUser() user: any) {
    return this.leads.getLeadDetail(leadId, user.id);
  }
}
```

---

## 6. REST API Design Patterns

### 6.1 Naming Conventions & Pagination

**Endpoints:**
```
GET    /leads                    # List leads (paginated, filtered)
POST   /leads                    # Create lead
GET    /leads/:id                # Get one lead
PATCH  /leads/:id                # Update lead
DELETE /leads/:id                # Delete lead

GET    /leads/:id/activities     # Lead's activity log
POST   /leads/:id/convert        # Convert to customer
POST   /leads/bulk-import        # CSV import (async job)

GET    /customers/:id/orders     # Customer's orders
POST   /orders/:id/fulfill       # Mark order fulfilled
```

### 6.2 Pagination + Filtering Query DTO

```typescript
// src/common/dto/pagination-query.dto.ts
import { Type } from 'class-transformer';
import { IsInt, Min, Max, IsOptional, IsString } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;

  @IsOptional()
  @IsString()
  sort: string = '-created_at'; // '-' prefix = descending
}

// src/leads/dto/filter-leads.dto.ts
import { IsOptional, IsString, IsEnum, Type } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto.ts';
import { LeadStatus } from '@crm/types';

export class FilterLeadsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string; // Name, email fuzzy search

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsString()
  owner_id?: string;

  @IsOptional()
  @Type(() => Number)
  min_score?: number;

  @IsOptional()
  @Type(() => Number)
  max_score?: number;
}
```

### 6.3 Paginated Response DTO

```typescript
// src/common/dto/paginated-response.dto.ts
export class PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

// Usage in controller:
@Get()
async listLeads(@Query() query: FilterLeadsDto) {
  const { data, total } = await this.leads.findMany(query);
  return {
    data,
    meta: {
      total,
      page: query.page,
      limit: query.limit,
      pages: Math.ceil(total / query.limit),
    },
  };
}
```

### 6.4 Response Serialization

```typescript
// src/leads/dto/lead-response.dto.ts
import { Exclude, Expose } from 'class-transformer';

export class LeadResponseDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  email: string;

  @Expose()
  score: number;

  @Expose()
  status: string;

  @Exclude() // Never expose in API
  deleted_at?: Date;

  @Exclude()
  internal_notes?: string;
}

// In controller:
@UseInterceptors(ClassSerializerInterceptor)
@Get(':id')
async getLead(@Param('id') leadId: string) {
  const lead = await this.repo.findById(leadId);
  return plainToInstance(LeadResponseDto, lead);
}
```

---

## 7. Error Handling & Exception Filters

### 7.1 Custom Exception Types

```typescript
// src/common/exceptions/custom-exceptions.ts
import { HttpException, HttpStatus } from '@nestjs/common';

export class ResourceNotFoundException extends HttpException {
  constructor(resource: string, id: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        message: `${resource} with ID ${id} not found`,
        error: 'NotFound',
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class DuplicateResourceException extends HttpException {
  constructor(resource: string, field: string, value: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        message: `${resource} with ${field}=${value} already exists`,
        error: 'Conflict',
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class ValidationFailedException extends HttpException {
  constructor(errors: object) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        errors,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message: string = 'Unauthorized') {
    super(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        message,
        error: 'Unauthorized',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class ForbiddenException extends HttpException {
  constructor(message: string = 'Forbidden') {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        message,
        error: 'Forbidden',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
```

### 7.2 Global Exception Filter

```typescript
// src/common/filters/global-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = 500;
    let message = 'Internal Server Error';
    let error = 'InternalServerError';

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse() as any;
      status = exception.getStatus();
      message = exceptionResponse.message || message;
      error = exceptionResponse.error || error;
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
      message = exception.message;
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      error,
    });
  }
}

// Register in main.ts:
app.useGlobalFilters(new GlobalExceptionFilter());
```

### 7.3 Validation Pipe

```typescript
// main.ts
import { ValidationPipe } from '@nestjs/common';

app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,          // Strip unknown properties
    forbidNonWhitelisted: true, // Throw on unknown properties
    transform: true,          // Auto-transform to DTO class
    transformOptions: {
      enableImplicitConversion: true,
    },
  }),
);
```

---

## 8. Business Logic Patterns

### 8.1 Lead Assignment Service (Manual + AI)

```typescript
// src/leads/services/lead-assignment.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { LeadRepositoryService } from './lead-repository.service';
import { LeadScoringService } from './lead-scoring.service';

@Injectable()
export class LeadAssignmentService {
  constructor(
    private repo: LeadRepositoryService,
    private scoring: LeadScoringService,
  ) {}

  /**
   * Manual assignment: by user, respects ownership
   */
  async assignToUser(leadId: string, assigneeId: string, assignedBy: string) {
    const lead = await this.repo.findById(leadId, assignedBy);
    if (lead.owner_id !== assignedBy && assignedBy !== 'SUPER_ADMIN') {
      throw new BadRequestException('Cannot reassign lead you do not own');
    }

    return await this.repo.update(leadId, {
      owner_id: assigneeId,
      assigned_at: new Date(),
    });
  }

  /**
   * AI assignment: by lead score + user capacity
   * Algorithm: weighted round-robin on available users
   */
  async assignByAI(leadId: string, teamId: string) {
    const lead = await this.repo.findById(leadId, null);
    const score = await this.scoring.calculateScore({
      name: lead.name,
      email: lead.email,
    });

    // Get all active team members + their current load
    const users = await this.repo.findTeamUsersWithLoad(teamId);
    if (users.length === 0) {
      throw new BadRequestException('No users available in team');
    }

    // Weighted assignment: users with fewer leads get higher weight
    const weights = users.map((u) => ({
      userId: u.id,
      weight: Math.max(10 - u.leadCount, 1), // Min weight = 1
      score,
    }));

    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
    let random = Math.random() * totalWeight;

    let selectedUserId: string;
    for (const w of weights) {
      random -= w.weight;
      if (random <= 0) {
        selectedUserId = w.userId;
        break;
      }
    }

    return await this.repo.update(leadId, {
      owner_id: selectedUserId,
      assigned_at: new Date(),
    });
  }

  /**
   * Bulk reassign: all unassigned leads in team
   */
  async assignUnassignedLeads(teamId: string) {
    const unassignedLeads = await this.repo.findMany(
      { where: { team_id: teamId, owner_id: null, status: 'new' } },
      { skip: 0, take: 1000 },
    );

    for (const lead of unassignedLeads[0]) {
      await this.assignByAI(lead.id, teamId);
    }

    return { assigned: unassignedLeads[0].length };
  }
}
```

### 8.2 Lead Scoring Service

```typescript
// src/leads/services/lead-scoring.service.ts
import { Injectable } from '@nestjs/common';

interface LeadData {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  source?: string;
}

@Injectable()
export class LeadScoringService {
  /**
   * Calculate lead quality score (0-100)
   * Factors: data completeness, email domain, engagement history
   */
  async calculateScore(lead: LeadData): Promise<number> {
    let score = 0;

    // Data completeness (0-30 points)
    const completeness = Object.values(lead).filter((v) => v).length / Object.keys(lead).length;
    score += completeness * 30;

    // Email domain quality (0-20 points)
    if (lead.email) {
      const freeEmailDomains = ['gmail.com', 'yahoo.com', 'hotmail.com'];
      const isFreeDomain = freeEmailDomains.some((d) => lead.email.endsWith(d));
      score += isFreeDomain ? 10 : 20;
    }

    // Source quality (0-20 points)
    const sourceScores = { referral: 20, inbound: 15, cold_call: 10, import: 5 };
    score += sourceScores[lead.source] || 0;

    // Company size estimate (0-30 points)
    if (lead.company) {
      const largeKeywords = ['enterprise', 'corp', 'group', 'inc'];
      const isLarge = largeKeywords.some((kw) => lead.company.toLowerCase().includes(kw));
      score += isLarge ? 30 : 15;
    }

    return Math.min(score, 100);
  }

  /**
   * User weighted score: lead score * user's conversion rate
   */
  async calculateWeightedScoreForUser(
    lead: LeadData,
    userId: string,
    repo: any,
  ): Promise<number> {
    const leadScore = await this.calculateScore(lead);
    const userStats = await repo.getUserConversionStats(userId);

    // Weighted by user's historical conversion rate (0.8 = 80% convert)
    const weight = Math.max(userStats.conversionRate, 0.5);
    return leadScore * weight;
  }
}
```

### 8.3 Lead-to-Customer Conversion (Transactional)

```typescript
// src/leads/services/lead.service.ts
async convertLeadToCustomer(leadId: string, userId: string) {
  const lead = await this.repo.findById(leadId, userId);
  if (!lead) throw new NotFoundException('Lead not found');
  if (lead.status === 'converted') {
    throw new BadRequestException('Lead already converted');
  }

  // Transaction: atomic operation
  const result = await this.prisma.$transaction(
    async (tx) => {
      // 1. Create customer record
      const customer = await tx.customer.create({
        data: {
          name: lead.name,
          email: lead.email,
          source_lead_id: leadId,
          team_id: lead.team_id,
          converted_by: userId,
          converted_at: new Date(),
        },
      });

      // 2. Update lead status
      const updatedLead = await tx.lead.update({
        where: { id: leadId },
        data: {
          status: 'converted',
          converted_at: new Date(),
          converted_customer_id: customer.id,
        },
      });

      // 3. Create activity log
      await tx.activity.create({
        data: {
          type: 'conversion',
          lead_id: leadId,
          user_id: userId,
          description: `Lead converted to customer #${customer.id}`,
        },
      });

      return { customer, lead: updatedLead };
    },
    {
      maxWait: 5000,
      timeout: 30000,
    },
  );

  // 4. Emit event (outside transaction)
  this.eventEmitter.emit('lead.converted', {
    leadId,
    customerId: result.customer.id,
    userId,
  });

  return result.customer;
}
```

---

## 9. Background Jobs (Bull/BullMQ)

### 9.1 CSV Import Job Queue

```typescript
// src/csv-import/processors/csv-import.processor.ts
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { LeadRepositoryService } from 'src/leads/services/lead-repository.service';
import { parse } from 'csv-parse';
import { createReadStream } from 'fs';

@Processor('csv-import')
export class CsvImportProcessor {
  constructor(private leadRepo: LeadRepositoryService) {}

  @Process()
  async processCsvImport(job: Job<{ filePath: string; teamId: string }>) {
    const { filePath, teamId } = job.data;
    let processedCount = 0;
    let errorCount = 0;

    return new Promise((resolve, reject) => {
      createReadStream(filePath)
        .pipe(
          parse({
            columns: true,
            skip_empty_lines: true,
          }),
        )
        .on('data', async (record) => {
          try {
            // Validate CSV row
            if (!record.name || !record.email) {
              errorCount++;
              return;
            }

            // Create lead
            await this.leadRepo.create({
              name: record.name,
              email: record.email,
              company: record.company,
              phone: record.phone,
              team_id: teamId,
            });

            processedCount++;

            // Update job progress every 100 leads
            if (processedCount % 100 === 0) {
              job.progress((processedCount / (processedCount + errorCount)) * 100);
            }
          } catch (error) {
            errorCount++;
          }
        })
        .on('error', (error) => reject(error))
        .on('end', () => {
          resolve({
            processedCount,
            errorCount,
            successRate: (processedCount / (processedCount + errorCount)) * 100,
          });
        });
    });
  }
}

// src/csv-import/services/csv-import.service.ts
import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';

@Injectable()
export class CsvImportService {
  constructor(@InjectQueue('csv-import') private csvQueue: Queue) {}

  async queueCsvImport(filePath: string, teamId: string) {
    const job = await this.csvQueue.add(
      { filePath, teamId },
      {
        priority: 5,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
      },
    );

    return { jobId: job.id, status: 'queued' };
  }

  async getJobStatus(jobId: number) {
    const job = await this.csvQueue.getJob(jobId);
    if (!job) return null;

    return {
      id: job.id,
      status: job._progress,
      progress: job._progress,
      data: job.data,
      result: job.returnvalue,
    };
  }
}
```

### 9.2 Job Registration in Module

```typescript
// src/csv-import/csv-import.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { CsvImportService } from './services/csv-import.service';
import { CsvImportProcessor } from './processors/csv-import.processor';
import { CsvImportController } from './controllers/csv-import.controller';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'csv-import',
      redis: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT),
      },
    }),
  ],
  providers: [CsvImportService, CsvImportProcessor],
  controllers: [CsvImportController],
})
export class CsvImportModule {}
```

---

## 10. Logging & Monitoring

### 10.1 Structured Logging with Pino

```typescript
// main.ts
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import pinoHttp from 'pino-http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Structured logging
  app.use(
    pinoHttp({
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: false,
        },
      },
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.listen(3000);
}

bootstrap();

// Usage in service:
import { Logger } from '@nestjs/common';

@Injectable()
export class LeadService {
  private logger = new Logger(LeadService.name);

  async createLead(dto: CreateLeadDto, userId: string) {
    this.logger.log(`Creating lead: ${dto.name} by ${userId}`);
    try {
      const lead = await this.repo.create(dto);
      this.logger.debug(`Lead created: ${lead.id}`);
      return lead;
    } catch (error) {
      this.logger.error(`Failed to create lead: ${error.message}`, error.stack);
      throw error;
    }
  }
}
```

### 10.2 Health Checks

```typescript
// src/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prisma: PrismaHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.prisma.pingCheck('database')]);
  }
}

// Register in app.module.ts:
import { TerminusModule } from '@nestjs/terminus';

@Module({
  imports: [TerminusModule],
})
export class AppModule {}
```

---

## 11. Testing Strategy

### 11.1 Unit Test: Service

```typescript
// src/leads/services/lead.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { LeadService } from './lead.service';
import { LeadRepositoryService } from './lead-repository.service';
import { LeadScoringService } from './lead-scoring.service';

describe('LeadService', () => {
  let service: LeadService;
  let mockRepo: jest.Mocked<LeadRepositoryService>;
  let mockScoring: jest.Mocked<LeadScoringService>;

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn(),
      findById: jest.fn(),
    } as any;

    mockScoring = {
      calculateScore: jest.fn().mockResolvedValue(75),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadService,
        { provide: LeadRepositoryService, useValue: mockRepo },
        { provide: LeadScoringService, useValue: mockScoring },
      ],
    }).compile();

    service = module.get<LeadService>(LeadService);
  });

  describe('createLead', () => {
    it('should create a lead with calculated score', async () => {
      const dto = { name: 'John Doe', email: 'john@example.com' };
      const userId = 'user-123';

      mockRepo.create.mockResolvedValue({
        id: 'lead-123',
        ...dto,
        score: 75,
        owner_id: null,
      } as any);

      const result = await service.createLead(dto, userId);

      expect(mockScoring.calculateScore).toHaveBeenCalledWith(dto);
      expect(mockRepo.create).toHaveBeenCalled();
      expect(result.id).toBe('lead-123');
    });

    it('should throw error if lead creation fails', async () => {
      mockRepo.create.mockRejectedValue(new Error('DB error'));

      await expect(service.createLead({ name: 'John', email: 'john@test.com' }, 'user-1')).rejects.toThrow(
        'DB error',
      );
    });
  });
});
```

### 11.2 Integration Test: Controller + Service

```typescript
// src/leads/controllers/lead.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { LeadController } from './lead.controller';
import { LeadService } from '../services/lead.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('LeadController', () => {
  let controller: LeadController;
  let service: LeadService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeadController],
      providers: [
        LeadService,
        {
          provide: PrismaService,
          useValue: {
            lead: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    controller = module.get<LeadController>(LeadController);
    service = module.get<LeadService>(LeadService);
  });

  describe('POST /leads', () => {
    it('should create a lead and return it', async () => {
      const dto = { name: 'Jane Doe', email: 'jane@example.com' };
      const user = { id: 'user-123', team_id: 'team-123' };

      jest.spyOn(service, 'createLead').mockResolvedValue({
        id: 'lead-456',
        ...dto,
        owner_id: null,
        team_id: 'team-123',
      } as any);

      const result = await controller.createLead(dto, user);

      expect(result.id).toBe('lead-456');
      expect(service.createLead).toHaveBeenCalledWith(dto, user.id);
    });
  });
});
```

---

## 12. Docker & Deployment

### 12.1 Dockerfile for NestJS

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# Production image
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### 12.2 docker-compose for Local Dev

```yaml
# docker-compose.yml
version: '3.9'

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: crm_user
      POSTGRES_PASSWORD: crm_password
      POSTGRES_DB: crm_db
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

  api:
    build: ./apps/api
    ports:
      - '3000:3000'
    environment:
      DATABASE_URL: postgresql://crm_user:crm_password@postgres:5432/crm_db
      REDIS_URL: redis://redis:6379
      JWT_SECRET: dev_secret_change_in_prod
    depends_on:
      - postgres
      - redis
    volumes:
      - ./apps/api/src:/app/src

volumes:
  postgres_data:
```

---

## 13. Key Dependencies & Versions

| Package | Version | Purpose |
|---------|---------|---------|
| @nestjs/common | ^10.3.0 | Core NestJS |
| @nestjs/core | ^10.3.0 | Core runtime |
| @nestjs/jwt | ^12.1.0 | JWT tokens |
| @nestjs/passport | ^10.0.3 | Auth middleware |
| @nestjs/bull | ^10.0.1 | Job queues |
| @nestjs/terminus | ^10.1.0 | Health checks |
| @prisma/client | ^5.9.0 | ORM |
| prisma | ^5.9.0 | Schema management |
| class-validator | ^0.14.0 | DTO validation |
| class-transformer | ^0.5.1 | DTO serialization |
| passport-jwt | ^4.0.1 | JWT strategy |
| bull | ^4.12.0 | Job queue (legacy) |
| pino | ^8.18.0 | Logger |
| pino-http | ^8.7.0 | HTTP logger |
| multer | ^1.4.5-lts.1 | File upload |
| @types/multer | ^1.4.11 | Type definitions |

---

## 14. Code Example: Complete Lead Feature

### 14.1 Folder Structure

```
src/leads/
├── controllers/
│   └── lead.controller.ts          # HTTP handlers
├── services/
│   ├── lead.service.ts             # Business logic
│   ├── lead-repository.service.ts  # Data access (Prisma)
│   ├── lead-assignment.service.ts  # Assignment logic
│   └── lead-scoring.service.ts     # Scoring algorithm
├── guards/
│   └── lead-ownership.guard.ts     # Resource auth
├── decorators/
│   └── owner-or-manager.decorator.ts
├── dto/
│   ├── create-lead.dto.ts
│   ├── update-lead.dto.ts
│   ├── filter-lead.dto.ts
│   └── lead-response.dto.ts
├── entities/
│   └── lead.entity.ts              # Type definitions
├── interceptors/
│   └── lead-response.interceptor.ts
└── leads.module.ts
```

### 14.2 Complete Controller Example

```typescript
// src/leads/controllers/lead.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { LeadService } from '../services/lead.service';
import { CreateLeadDto } from '../dto/create-lead.dto';
import { UpdateLeadDto } from '../dto/update-lead.dto';
import { FilterLeadsDto } from '../dto/filter-lead.dto';
import { JwtGuard } from 'src/auth/guards/jwt.guard';
import { LeadOwnershipGuard } from '../guards/lead-ownership.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { LeadResponseDto } from '../dto/lead-response.dto';

@Controller('leads')
@UseGuards(JwtGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class LeadController {
  constructor(private leads: LeadService) {}

  @Post()
  async createLead(@Body() dto: CreateLeadDto, @CurrentUser() user: any) {
    const lead = await this.leads.createLead(dto, user.id);
    return new LeadResponseDto(lead);
  }

  @Get()
  async list(@Query() query: FilterLeadsDto, @CurrentUser('id') userId: string) {
    const { data, total } = await this.leads.findMany(query, userId);
    return {
      data: data.map((l) => new LeadResponseDto(l)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  @Get(':id')
  @UseGuards(LeadOwnershipGuard)
  async getOne(@Param('id') leadId: string, @CurrentUser() user: any) {
    const lead = await this.leads.getLeadDetail(leadId, user.id);
    return new LeadResponseDto(lead);
  }

  @Patch(':id')
  @UseGuards(LeadOwnershipGuard)
  async update(
    @Param('id') leadId: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser('id') userId: string,
  ) {
    const lead = await this.leads.updateLead(leadId, dto, userId);
    return new LeadResponseDto(lead);
  }

  @Delete(':id')
  @UseGuards(LeadOwnershipGuard)
  async delete(@Param('id') leadId: string, @CurrentUser('id') userId: string) {
    await this.leads.deleteLead(leadId, userId);
    return { message: 'Lead deleted' };
  }

  @Post(':id/assign')
  async assign(
    @Param('id') leadId: string,
    @Body() body: { assignee_id: string },
    @CurrentUser('id') userId: string,
  ) {
    const lead = await this.leads.assignLead(leadId, body.assignee_id, userId);
    return new LeadResponseDto(lead);
  }

  @Post(':id/convert')
  async convertToCustomer(
    @Param('id') leadId: string,
    @CurrentUser('id') userId: string,
  ) {
    const customer = await this.leads.convertLeadToCustomer(leadId, userId);
    return { customerId: customer.id, message: 'Lead converted' };
  }
}
```

---

## 15. Middleware & Global Setup

### 15.1 App Module Setup

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { TerminusModule } from '@nestjs/terminus';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LeadsModule } from './leads/leads.module';
import { CustomersModule } from './customers/customers.module';
import { OrdersModule } from './orders/orders.module';
import { ActivitiesModule } from './activities/activities.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CsvImportModule } from './csv-import/csv-import.module';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    TerminusModule,
    AuthModule,
    UsersModule,
    LeadsModule,
    CustomersModule,
    OrdersModule,
    ActivitiesModule,
    AnalyticsModule,
    CsvImportModule,
    SharedModule,
  ],
})
export class AppModule {}
```

### 15.2 Main.ts Bootstrap

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import pinoHttp from 'pino-http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global middleware
  app.use(
    pinoHttp({
      level: process.env.LOG_LEVEL || 'info',
    }),
  );

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global filters
  app.useGlobalFilters(new GlobalExceptionFilter());

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || ['http://localhost:3001'],
    credentials: true,
  });

  // API prefix
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}`);
}

bootstrap();
```

---

## 16. Production Considerations

### 16.1 Environment Variables (.env.example)

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/crm_db
PRISMA_LOG_LEVEL=debug

# Auth
JWT_SECRET=your-secret-key-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# Redis (Bull queues)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# File Upload
MINIO_ENDPOINT=minio.example.com
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=crm-uploads

# API
PORT=3000
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGIN=https://crm.example.com

# Features
ENABLE_CSV_IMPORT=true
ENABLE_AI_ASSIGNMENT=true
```

### 16.2 Rate Limiting

```typescript
// src/common/middleware/rate-limit.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { rateLimit } from 'express-rate-limit';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  use = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests, please try again later.',
  });
}

// Register in app.module.ts:
app.use(new RateLimitMiddleware().use);
```

---

## 17. Unresolved Questions

1. **Database Indexing Strategy**: What indexes to create on Prisma schema for lead filters (status, owner_id, score, created_at)?
2. **Event-Driven Architecture**: Should activity logging use EventEmitter2 or event sourcing pattern?
3. **Soft Deletes**: Should leads/customers support soft deletes (deleted_at field) or hard delete?
4. **API Caching**: Should we cache lead lists (Redis) or query fresh each time?
5. **Analytics Real-time**: Should dashboard metrics use real-time queries or batch-updated materialized views?
6. **Search Performance**: For large lead bases (10k+), fuzzy search on name/email - should use full-text search (PostgreSQL FTS) or Elasticsearch?
7. **File Upload Size**: What's the max CSV file size and timeout for bulk imports?
8. **3rd Party Webhook Security**: How to verify webhook signatures from call center provider?
9. **Multi-tenancy**: Should each team have isolated database schemas or row-level security?
10. **Audit Trail**: Should all data changes be logged (who changed what when) via middleware or event listeners?

---

## Summary

This report covers production-ready NestJS patterns for CRM systems. Key takeaways:

- **Module structure**: Organize by feature (leads, customers, orders), with internal layer separation (controller → service → repository)
- **Turborepo**: Monorepo structure with shared packages for types, utilities, database schemas
- **Auth**: JWT + refresh token rotation with token family tracking to prevent replay attacks
- **RBAC**: Role hierarchy (SUPER_ADMIN > MANAGER > USER) + resource-based guards for lead ownership
- **API Design**: REST with pagination, filtering, serialized responses, global exception handling
- **Business Logic**: Lead scoring, AI-weighted assignment, transactional conversions, event emission for side effects
- **Background Jobs**: Bull queues for CSV imports, async processing
- **Testing**: Unit tests (mocked repos), integration tests (with Prisma mocks)
- **Deployment**: Docker setup, health checks, structured logging with Pino

All patterns emphasize pragmatism over over-engineering—suitable for 50-200 user teams with potential scale to larger deployments.

