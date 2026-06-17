import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export type Decimal = Prisma.Decimal;
export const Decimal = Prisma.Decimal;

// Money is a string at the edge (DTOs) and a Decimal in services — never a
// JS number. These helpers are the single conversion point between the two.

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;
// Commission rates are fractions (0.02 = 2%) with up to 8 dp, matching the
// Decimal(20,8) rate columns on CommissionConfig.
const RATE_PATTERN = /^\d+(\.\d{1,8})?$/;

/**
 * Parse a money string into a Decimal, enforcing format (digits, max 2 dp) and
 * an inclusive [min, max] range. Throws 400 on any violation.
 */
export function parseMoney(
  raw: string,
  min: number,
  max: number,
  field = 'amount',
): Decimal {
  if (typeof raw !== 'string' || !MONEY_PATTERN.test(raw)) {
    throw new BadRequestException(
      `${field}: must be a numeric string with up to 2 decimal places`,
    );
  }
  const value = new Decimal(raw);
  if (value.lessThan(min) || value.greaterThan(max)) {
    throw new BadRequestException(
      `${field}: must be between ${min} and ${max}`,
    );
  }
  return value;
}

/** Format a Decimal back to a fixed 2-dp string for API responses. */
export function formatMoney(value: Decimal): string {
  return value.toFixed(2);
}

/**
 * Parse a money string into a Decimal, enforcing only the format (digits, max 2
 * dp). Use when the valid range is dynamic (e.g. per-game stake bounds checked
 * by the caller). Throws 400 on a malformed value.
 */
export function parseMoneyValue(raw: string, field = 'amount'): Decimal {
  if (typeof raw !== 'string' || !MONEY_PATTERN.test(raw)) {
    throw new BadRequestException(
      `${field}: must be a numeric string with up to 2 decimal places`,
    );
  }
  return new Decimal(raw);
}

/**
 * Parse a commission-rate string (fraction, e.g. "0.02" = 2%) into a Decimal in
 * the inclusive [0, 1] range. Throws 400 on any violation.
 */
export function parseRate(raw: string, field = 'rate'): Decimal {
  if (typeof raw !== 'string' || !RATE_PATTERN.test(raw)) {
    throw new BadRequestException(
      `${field}: must be a numeric string with up to 8 decimal places`,
    );
  }
  const value = new Decimal(raw);
  if (value.lessThan(0) || value.greaterThan(1)) {
    throw new BadRequestException(
      `${field}: must be a fraction between 0 and 1`,
    );
  }
  return value;
}

/**
 * DTO validator: accepts a numeric string with up to 2 decimal places within
 * the inclusive [min, max] range. Keeps range rejection at the 400 layer.
 */
export function IsMoneyInRange(
  min: number,
  max: number,
  options?: ValidationOptions,
) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isMoneyInRange',
      target: object.constructor,
      propertyName,
      constraints: [min, max],
      options,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string' || !MONEY_PATTERN.test(value)) {
            return false;
          }
          const dec = new Decimal(value);
          return !dec.lessThan(min) && !dec.greaterThan(max);
        },
        defaultMessage(args: ValidationArguments) {
          const [lo, hi] = args.constraints as [number, number];
          return `${args.property} must be a numeric string (max 2 dp) between ${lo} and ${hi}`;
        },
      },
    });
  };
}

/**
 * DTO validator: accepts a commission-rate fraction string in [0, 1] with up to
 * 8 decimal places.
 */
export function IsRate(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isRate',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string' || !RATE_PATTERN.test(value)) {
            return false;
          }
          const dec = new Decimal(value);
          return !dec.lessThan(0) && !dec.greaterThan(1);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a fraction string (0-1, max 8 dp)`;
        },
      },
    });
  };
}
