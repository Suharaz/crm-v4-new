import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { isValidVNPhone, normalizePhone } from '@crm/utils';
import { AddCustomerPhoneDto, UpdateCustomerPhoneDto } from './dto/customer-phone.dto';

/**
 * Helper service - single source of truth cho mọi logic liên quan tới
 * dedup/search SĐT cross-table (số chính `customers.phone` + số phụ
 * `customer_phones.phone`).
 *
 * KHÔNG inject `CustomersService` để tránh circular dep.
 */
@Injectable()
export class CustomerPhonesService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Tìm Customer match SĐT - match số chính TRƯỚC, sau đó tới số phụ.
   * @returns Customer bare (không include relation) hoặc null nếu không tìm thấy.
   */
  async findCustomerByAnyPhone(phone: string) {
    const normalized = normalizePhone(phone);

    // 1) Match số chính
    const primary = await this.prisma.customer.findFirst({
      where: { phone: normalized, deletedAt: null },
    });
    if (primary) return primary;

    // 2) Match số phụ → trả Customer qua FK
    const alt = await this.prisma.customerPhone.findFirst({
      where: { phone: normalized, deletedAt: null },
      include: { customer: true },
    });
    return alt?.customer ?? null;
  }

  /**
   * Throw `ConflictException` nếu SĐT (sau normalize) đã tồn tại trên customer khác -
   * tính cả số chính lẫn số phụ.
   * @param excludeCustomerId - bỏ qua customer này khi check (dùng khi update chính KH đó).
   */
  async assertPhoneNotExists(phone: string, excludeCustomerId?: bigint): Promise<void> {
    const normalized = normalizePhone(phone);
    if (!isValidVNPhone(normalized)) {
      throw new ConflictException('Số điện thoại không hợp lệ');
    }

    const primaryHit = await this.prisma.customer.findFirst({
      where: {
        phone: normalized,
        deletedAt: null,
        ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}),
      },
      select: { id: true },
    });
    if (primaryHit) {
      throw new ConflictException('Số điện thoại đã trùng (số chính của khách hàng khác)');
    }

    const altHit = await this.prisma.customerPhone.findFirst({
      where: {
        phone: normalized,
        deletedAt: null,
        ...(excludeCustomerId ? { customerId: { not: excludeCustomerId } } : {}),
      },
      select: { id: true },
    });
    if (altHit) {
      throw new ConflictException('Số điện thoại đã trùng (số phụ của khách hàng khác)');
    }
  }

  /** Thêm số phụ cho 1 customer. Throw nếu trùng. */
  async addPhone(customerId: bigint, dto: AddCustomerPhoneDto, createdBy: bigint) {
    const phone = normalizePhone(dto.phone);
    await this.assertPhoneNotExists(phone, customerId);

    return this.prisma.customerPhone.create({
      data: {
        customerId,
        phone,
        label: dto.label ?? null,
        note: dto.note ?? null,
        createdBy,
      },
    });
  }

  /** Update 1 số phụ (phone/label/note). Throw nếu phone mới trùng KH khác. */
  async updatePhone(phoneId: bigint, dto: UpdateCustomerPhoneDto) {
    const existing = await this.prisma.customerPhone.findUnique({ where: { id: phoneId } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Không tìm thấy số phụ');
    }

    const updateData: { phone?: string; label?: string | null; note?: string | null } = {};
    if (dto.phone) {
      const phone = normalizePhone(dto.phone);
      await this.assertPhoneNotExists(phone, existing.customerId);
      updateData.phone = phone;
    }
    if (dto.label !== undefined) updateData.label = dto.label || null;
    if (dto.note !== undefined) updateData.note = dto.note || null;

    return this.prisma.customerPhone.update({ where: { id: phoneId }, data: updateData });
  }

  /** Soft delete số phụ (giữ row để audit). */
  async softDeletePhone(phoneId: bigint) {
    const existing = await this.prisma.customerPhone.findUnique({ where: { id: phoneId } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Không tìm thấy số phụ');
    }
    return this.prisma.customerPhone.update({
      where: { id: phoneId },
      data: { deletedAt: new Date() },
    });
  }

  /** List số phụ active của 1 customer (sort theo thời gian thêm). */
  async listPhones(customerId: bigint) {
    return this.prisma.customerPhone.findMany({
      where: { customerId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }
}
