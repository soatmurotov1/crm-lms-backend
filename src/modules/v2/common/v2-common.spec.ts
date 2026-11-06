import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { PrismaService } from 'src/common/prisma/prisma.service';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import { readCookie } from './v2-cookie';
import { V2ScopeService } from './v2-scope.service';
import { parseId, percent, toV2Role } from './v2.mapper';

const admin: RequestUser = {
  id: 2,
  phone: '+998900000002',
  fullName: 'Admin A',
  role: Role.ADMIN,
  organizationId: 10,
};

describe('readCookie', () => {
  it('bir nechta cookie ichidan keraklisini topadi', () => {
    expect(readCookie('a=1; crm_session=abc.def; b=2', 'crm_session')).toBe(
      'abc.def',
    );
  });

  it('nomi o‘xshash boshqa cookie bilan adashmaydi', () => {
    expect(readCookie('xcrm_session=bad', 'crm_session')).toBeUndefined();
  });

  it('sarlavha yo‘q yoki buzuq bo‘lsa undefined', () => {
    expect(readCookie(undefined, 'crm_session')).toBeUndefined();
    expect(readCookie('crm_session=%E0%A4%A', 'crm_session')).toBeUndefined();
    expect(readCookie('crm_session=', 'crm_session')).toBeUndefined();
  });
});

describe('v2.mapper', () => {
  it('rollarni frontend nomlariga o‘giradi', () => {
    expect(toV2Role(Role.SUPERADMIN)).toBe('dev');
    expect(toV2Role(Role.ADMIN)).toBe('owner');
    expect(toV2Role(Role.MANAGEMENT)).toBe('manager');
    expect(toV2Role(Role.ADMINSTRATOR)).toBe('operator');
    expect(toV2Role(Role.STUDENT)).toBeNull();
  });

  it('yaroqsiz id — "topilmadi"', () => {
    expect(parseId('42')).toBe(42);
    for (const bad of ['0', 'abc', '1.5', '-3', '', '12345678901']) {
      expect(() => parseId(bad)).toThrow(NotFoundException);
    }
  });

  it('maxraj nol bo‘lsa foiz 0', () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(5, 0)).toBe(0);
  });
});

describe('V2ScopeService', () => {
  let findUnique: jest.Mock;
  let scope: V2ScopeService;

  beforeEach(() => {
    findUnique = jest.fn();
    scope = new V2ScopeService({
      branch: { findUnique },
    } as unknown as PrismaService);
  });

  it('xodim faqat o‘z tashkilotini ko‘radi, company_id e‘tiborga olinmaydi', () => {
    expect(scope.org(admin, 99)).toEqual({ organizationId: 10 });
  });

  it('tashkilotsiz xodim hech narsa ko‘rmaydi', () => {
    expect(scope.org({ ...admin, organizationId: null })).toBeNull();
  });

  it('SUPERADMIN hammasini yoki tanlangan tashkilotni ko‘radi', () => {
    const superAdmin = {
      ...admin,
      role: Role.SUPERADMIN,
      organizationId: null,
    };

    expect(scope.org(superAdmin)).toEqual({});
    expect(scope.org(superAdmin, 7)).toEqual({ organizationId: 7 });
  });

  it('so‘rovda filial yo‘q bo‘lsa sarlavhadagi olinadi', async () => {
    await expect(scope.branch(admin, undefined, 3)).resolves.toBe(3);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('o‘z tashkilotining faol filialini qabul qiladi', async () => {
    findUnique.mockResolvedValue({ organizationId: 10, status: 'ACTIVE' });

    await expect(scope.branch(admin, '5', null)).resolves.toBe(5);
  });

  it('begona tashkilot, nofaol yoki yaroqsiz filial rad etiladi', async () => {
    findUnique.mockResolvedValue({ organizationId: 11, status: 'ACTIVE' });
    await expect(scope.branch(admin, '5', null)).rejects.toThrow(
      'Bu filialga kirish huquqingiz yo‘q',
    );

    findUnique.mockResolvedValue({ organizationId: 10, status: 'INACTIVE' });
    await expect(scope.branch(admin, '5', null)).rejects.toThrow();

    findUnique.mockResolvedValue(null);
    await expect(scope.branch(admin, 'abc', null)).rejects.toThrow();
  });
});
